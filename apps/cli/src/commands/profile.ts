import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  analyzeTemplate,
  buildProfileSchema,
  checkProfile,
  describeKinds,
  getProfileGuide,
  GUIDE_TOPICS,
  type GuideTopic,
  type Issue,
} from '@yangsik/core';
import { testProfile } from '@yangsik/hwp';
import { loadProfileFile } from '@yangsik/core/node';
import { renderMermaid } from '@yangsik/diagram/node';
import { rhwpEngine } from '@yangsik/engine-rhwp/node';
import { EXIT, formatIssues, type Out, readBytes, readText, UsageError } from '../util';

/** 양의 정수 옵션(NaN·0·음수는 비용 상한을 끄거나 시도를 없애므로 거부) */
function positiveInt(name: string, v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(v)) throw new UsageError(`${name}에는 1 이상의 정수가 필요함: ${v}`);
  return Number(v);
}

export const profileOptions = {
  md: { type: 'string' },
  'no-mermaid': { type: 'boolean' },
  all: { type: 'boolean' },
  strict: { type: 'boolean' },
  json: { type: 'boolean' },
  // generate
  template: { type: 'string' },
  'example-md': { type: 'string' },
  schema: { type: 'string' },
  type: { type: 'string' },
  hint: { type: 'string' },
  provider: { type: 'string' },
  model: { type: 'string' },
  capability: { type: 'string' },
  'max-iterations': { type: 'string' },
  'max-tokens': { type: 'string' },
  out: { type: 'string', short: 'o' },
  'allow-send': { type: 'boolean' },
  'print-prompt': { type: 'boolean' },
  'copy-inputs': { type: 'boolean' },
  force: { type: 'boolean' },
} as const;

export interface ProfileValues {
  md?: string;
  'no-mermaid'?: boolean;
  all?: boolean;
  strict?: boolean;
  template?: string;
  'example-md'?: string;
  schema?: string;
  type?: string;
  hint?: string;
  provider?: string;
  model?: string;
  capability?: string;
  'max-iterations'?: string;
  'max-tokens'?: string;
  out?: string;
  'allow-send'?: boolean;
  'print-prompt'?: boolean;
  'copy-inputs'?: boolean;
  force?: boolean;
}

const need = (cond: unknown, usage: string) => {
  if (!cond) throw new UsageError(`사용: ${usage}`);
};

/** 프로필 파일 점검: 문법·스키마·파일 존재 + 양식 대조 */
async function loadAndCheck(path: string) {
  const loaded = loadProfileFile(path);
  const issues: Issue[] = [...loaded.issues];
  const dataSchema =
    loaded.schemaPath && existsSync(loaded.schemaPath)
      ? (JSON.parse(readText(loaded.schemaPath)) as object)
      : undefined;
  if (loaded.profile && loaded.templatePath && existsSync(loaded.templatePath)) {
    const r = await checkProfile(rhwpEngine, loaded.profile, readBytes(loaded.templatePath), {
      lineOf: loaded.lineOf,
      dataSchema,
    });
    issues.push(...r.issues);
  }
  return { loaded, issues, dataSchema };
}

const strictCode = (issues: Issue[], strict?: boolean) =>
  issues.some((i) => i.severity === 'error') ? EXIT.input : strict && issues.length ? EXIT.strict : EXIT.ok;

export async function profileCmd(sub: string | undefined, args: string[], v: ProfileValues, out: Out): Promise<number> {
  switch (sub) {
    case 'check': {
      need(args[0], 'yangsik profile check <profile.yaml>');
      const { issues } = await loadAndCheck(args[0]);
      if (issues.length) out.info(formatIssues(basename(args[0]), issues));
      const code = strictCode(issues, v.strict);
      if (code === EXIT.ok) out.info(`OK  ${args[0]}${issues.length ? ` (경고 ${issues.length}건)` : ''}`);
      out.data({ ok: code === EXIT.ok, issues });
      return code;
    }
    case 'test': {
      need(args[0], 'yangsik profile test <profile.yaml> [--md 예제.md]');
      const { loaded, issues, dataSchema } = await loadAndCheck(args[0]);
      if (issues.some((i) => i.severity === 'error') || !loaded.profile || !loaded.templatePath) {
        out.err(formatIssues(basename(args[0]), issues));
        out.data({ ok: false, issues });
        return EXIT.input;
      }
      const mdPath = v.md ?? join(loaded.dir, 'example.md');
      if (!existsSync(mdPath)) throw new UsageError(`예제 md가 없음: ${mdPath} (--md로 지정)`);
      const work = join(loaded.dir, '.yangsik-work');
      const r = await testProfile(rhwpEngine, {
        profile: loaded.profile,
        template: readBytes(loaded.templatePath),
        exampleMd: readText(mdPath),
        dataSchema,
        renderDiagram: v['no-mermaid'] ? undefined : async (src, name) => renderMermaid(src, work, name),
      });
      if (r.violations?.length)
        out.info(
          `예제 md 규약 위반 ${r.violations.length}건\n${r.violations.map((x) => `  ${mdPath}:${x.line}  ${x.path}  ${x.message}`).join('\n')}`,
        );
      if (r.issues?.length) out.info(formatIssues(basename(args[0]), r.issues));
      for (const it of r.mapping?.items ?? []) {
        out.info(`\n${it.id}`);
        for (const row of it.rows)
          out.info(`  ${row.found ? '✔' : '✘'} ${row.label} ← ${row.value.replace(/\n/g, ' ⏎ ')}`);
      }
      if (r.report) {
        for (const c of r.report.verify.checks.filter((c) => !c.ok))
          out.info(`  ✘ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
        out.info(
          `\n${r.ok ? '통과' : '실패'}: ${r.report.pages}쪽, 항목 ${r.report.items}건, 셀 ${r.report.cellsSet}개`,
        );
      }
      out.data(r);
      return r.ok ? EXIT.ok : r.report ? EXIT.verify : EXIT.input;
    }
    case 'analyze': {
      need(args[0], 'yangsik profile analyze <양식.hwpx>');
      const facts = await analyzeTemplate(rhwpEngine, readBytes(args[0]));
      console.log(JSON.stringify(facts, null, 2));
      return EXIT.ok;
    }
    case 'kinds': {
      const kinds = describeKinds({ includeDefined: v.all });
      if (out.json) out.data(kinds);
      else
        for (const k of kinds)
          console.log(`${k.name}  [${k.status === 'verified' ? '사용 가능' : '정의만'}]  ${k.summary}`);
      return EXIT.ok;
    }
    case 'guide': {
      const topic = args[0] as GuideTopic | undefined;
      if (topic && !GUIDE_TOPICS.includes(topic)) throw new UsageError(`주제는 ${GUIDE_TOPICS.join(' | ')} 중 하나`);
      const g = getProfileGuide(topic);
      if (out.json) out.data(g);
      else console.log(g.markdown);
      return EXIT.ok;
    }
    case 'schema':
      console.log(JSON.stringify(buildProfileSchema(), null, 2));
      return EXIT.ok;
    case 'generate':
      return generate(v, out);
    default:
      throw new UsageError('사용: yangsik profile <check|test|analyze|kinds|guide|schema|generate> ...');
  }
}

const PROVIDERS: Record<string, { pkg: string; cls: string; capability: 'A' | 'B' | 'C' }> = {
  anthropic: { pkg: '@langchain/anthropic', cls: 'ChatAnthropic', capability: 'A' },
  openai: { pkg: '@langchain/openai', cls: 'ChatOpenAI', capability: 'A' },
  ollama: { pkg: '@langchain/ollama', cls: 'ChatOllama', capability: 'C' },
};

async function generate(v: ProfileValues, out: Out): Promise<number> {
  const usage =
    'yangsik profile generate --template 양식.hwpx --example-md 예제.md --provider <anthropic|openai|ollama> --model <id> --allow-send [--out 폴더]';
  need(v.template && v['example-md'], usage);
  const prov = v.provider ? PROVIDERS[v.provider] : undefined;
  if (!v['print-prompt']) {
    need(v.provider && v.model, usage);
    if (!prov) throw new UsageError(`알 수 없는 provider: ${v.provider} (${Object.keys(PROVIDERS).join(' | ')})`);
  }
  const capability = (v.capability ?? prov?.capability ?? 'A') as 'A' | 'B' | 'C';
  const maxIterations = positiveInt('--max-iterations', v['max-iterations']);
  const maxTotalTokens = positiveInt('--max-tokens', v['max-tokens']);
  const dir = v.out ?? 'out/profile-draft';
  const outputs = [
    'profile.yaml',
    'review.md',
    'review.json',
    ...(v['copy-inputs'] ? ['template.hwpx', 'example.md', ...(v.schema ? ['schema.json'] : [])] : []),
  ];
  // 승인·수정한 프로필을 모르고 덮어쓰지 않도록, 비용이 드는 호출 전에 확인한다
  if (!v['print-prompt'] && !v.force) {
    const exist = outputs.filter((f) => existsSync(join(dir, f)));
    if (exist.length)
      throw new UsageError(`${dir}에 이미 있는 파일: ${exist.join(', ')} (덮어쓰려면 --force, 아니면 다른 --out)`);
  }
  if (!['A', 'B', 'C'].includes(capability)) throw new UsageError('--capability는 A | B | C');
  const author = await import('@yangsik/author').catch(() => {
    throw new UsageError('@yangsik/author를 불러올 수 없음 (pnpm install)');
  });
  const input = {
    engine: rhwpEngine,
    template: readBytes(v.template as string),
    exampleMd: readText(v['example-md'] as string),
    dataSchema: v.schema ? (JSON.parse(readText(v.schema)) as object) : undefined,
    typeName: v.type,
    hint: v.hint,
  };

  if (v['print-prompt']) {
    const p = await author.previewPrompt(input, capability);
    if (out.json) out.data(p);
    else {
      out.info(`# 전송 내용 미리보기 (능력 ${capability}, 약 ${p.chars}자, 프롬프트 ${p.promptVersion})`);
      out.info(
        `포함: ${p.contains.join(', ')}\n제외: ${p.excludes.join(', ')}\n도구: ${p.tools.map((t) => t.name).join(', ') || '없음'}\n`,
      );
      out.info(`## 시스템\n${p.system}\n\n## 사용자\n${p.user}`);
    }
    return EXIT.ok;
  }
  if (!v['allow-send'])
    throw new UsageError(
      '양식 사실과 예제 md가 외부 LLM 제공자로 전송됩니다. 내용은 --print-prompt로 확인하고, 동의하면 --allow-send를 붙이세요.',
    );

  const mod = (await import(/* @vite-ignore */ (prov as NonNullable<typeof prov>).pkg).catch(() => {
    throw new UsageError(
      `${(prov as NonNullable<typeof prov>).pkg}가 설치되어 있지 않음: pnpm add -D --filter @yangsik/cli ${(prov as NonNullable<typeof prov>).pkg}`,
    );
  })) as Record<string, new (o: object) => never>;
  // 샘플링 파라미터는 지정하지 않는다. 키는 환경변수로만 받는다
  const chat = new mod[(prov as NonNullable<typeof prov>).cls]({ model: v.model }) as never;
  const llm = author.langChainClient(chat, { id: `${v.provider}/${v.model}`, capability });
  const res = await author.generateProfile(input, {
    llm,
    allowSend: true,
    maxIterations,
    maxTotalTokens,
  });

  mkdirSync(dir, { recursive: true });
  if (res.yaml) writeFileSync(join(dir, 'profile.yaml'), res.yaml);
  writeFileSync(join(dir, 'review.md'), author.reviewToMarkdown(res.review, res.yaml));
  writeFileSync(join(dir, 'review.json'), JSON.stringify(res.review, null, 2));
  if (v['copy-inputs']) {
    copyFileSync(v.template as string, join(dir, 'template.hwpx'));
    copyFileSync(v['example-md'] as string, join(dir, 'example.md'));
    if (v.schema) copyFileSync(v.schema, join(dir, 'schema.json'));
  }
  out.info(
    `${res.ok ? '통과' : '미통과'} (${res.stopReason}): 시도 ${res.attempts.length}회, 토큰 ${res.usage.inputTokens}/${res.usage.outputTokens}`,
  );
  out.info(`초안·보고서: ${dir}  (사람이 profile.yaml을 검토·수정한 뒤 'yangsik profile check'로 재점검)`);
  out.data({ ok: res.ok, stopReason: res.stopReason, dir, usage: res.usage, review: res.review });
  return res.ok ? EXIT.ok : EXIT.input;
}
