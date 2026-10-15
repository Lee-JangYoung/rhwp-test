import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  analyzeTemplate,
  buildProfileSchema,
  checkProfile,
  convertBytes,
  describeKinds,
  formatViolations,
  GUIDE_TOPICS,
  type GuideTopic,
  getProfileGuide,
  type Issue,
  type Profile,
  ProfileError,
  previewMapping,
  readMarkdown,
  testProfile,
  ValidationError,
  validateData,
} from '@yangsik/core';
import { findChromium, hwpPathOf, loadProfileFile, renderMermaid } from '@yangsik/core/node';
import { rhwpEngine } from '@yangsik/engine-rhwp/node';
import { z } from 'zod';
import { PathGuard } from './paths';

export interface ServerOptions {
  /** 파일 접근을 허용하는 폴더들(경로 탈출 방지). 상대 경로는 첫 폴더 기준 */
  roots: string[];
}

const text = (o: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(o, null, 1) }],
  structuredContent: o as Record<string, unknown>,
});
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

const mdRules = (profile: Profile) => {
  const lines: string[] = [];
  const walk = (name: string, c: Profile['md']['collections'][string], depth: number) => {
    const pad = '  '.repeat(depth);
    lines.push(`${pad}- ${'#'.repeat(c.heading.level)} 제목 '${c.heading.pattern}' 마다 하나의 항목(${name})`);
    for (const s of c.slots ?? [])
      lines.push(
        `${pad}  - ${s.key}: ${s.as}${s.under ? ` — '${s.under}' 제목 아래` : ''}${s.lang ? ` (\`\`\`${s.lang})` : ''}${(s.optional ?? s.as === 'code') ? ' (선택)' : ' (필수)'}`,
      );
    for (const [cn, cc] of Object.entries(c.children ?? {})) walk(cn, cc, depth + 1);
  };
  for (const [n, c] of Object.entries(profile.md.collections)) walk(n, c, 0);
  return `${profile.md.frontMatter ? `front-matter(YAML)는 '${profile.md.frontMatter}'로 읽는다.\n` : ''}${lines.join('\n')}`;
};

/** 프로필 경로로 프로필·양식·규약을 읽는다(허용 폴더 안에서만) */
function loadProfile(guard: PathGuard, profilePath: string) {
  const file = guard.read(profilePath);
  const loaded = loadProfileFile(file);
  const errors = loaded.issues.filter((i) => i.severity === 'error');
  return {
    file,
    loaded,
    errors,
    template:
      loaded.templatePath && existsSync(loaded.templatePath)
        ? new Uint8Array(readFileSync(guard.read(loaded.templatePath)))
        : undefined,
    schema:
      loaded.schemaPath && existsSync(loaded.schemaPath)
        ? (JSON.parse(readFileSync(guard.read(loaded.schemaPath), 'utf8')) as object)
        : undefined,
  };
}

const mdInput = (guard: PathGuard, a: { md_path?: string; md_text?: string }): { text: string; name: string } => {
  if (a.md_text !== undefined) return { text: a.md_text, name: 'input.md' };
  if (a.md_path) return { text: readFileSync(guard.read(a.md_path), 'utf8'), name: a.md_path };
  throw new Error('md_path 또는 md_text가 필요함');
};

/** 이 서버는 LLM API를 부르지 않는다. 도구 호출은 호스트 에이전트(LLM)가 한다. */
export function createServer(opts: ServerOptions): McpServer {
  const guard = new PathGuard(opts.roots);
  const server = new McpServer({ name: 'yangsik', version: '0.0.0' });
  const safe =
    <A>(f: (a: A) => Promise<ReturnType<typeof text>> | ReturnType<typeof text>) =>
    async (a: A) => {
      try {
        return await f(a);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    };

  // ---- 프로필 작성 도구 (환각 줄이기: 사실 조회 → 어휘 → 점검) ----------------------------------
  server.registerTool(
    'analyze_template',
    {
      title: '양식 분석',
      description:
        '양식(HWPX)의 사실을 조회한다: 표별 라벨·머리글, 누름틀, 토큰, 문단. 프로필의 위치·라벨은 이 결과의 텍스트만 쓴다.',
      inputSchema: { template_path: z.string().describe('양식 .hwpx 경로') },
    },
    safe(async ({ template_path }) =>
      text(await analyzeTemplate(rhwpEngine, new Uint8Array(readFileSync(guard.read(template_path))))),
    ),
  );
  server.registerTool(
    'list_kinds',
    {
      title: '사용 가능한 동작(kind)',
      description: '프로필에 쓸 수 있는 동작 목록과 키 스키마·예시. 기본은 검증된 것만.',
      inputSchema: { include_defined: z.boolean().optional() },
    },
    safe(({ include_defined }) => text({ kinds: describeKinds({ includeDefined: include_defined }) })),
  );
  server.registerTool(
    'get_guide',
    {
      title: '프로필 작성 가이드',
      description: `작성 가이드를 주제별로 조회한다(${GUIDE_TOPICS.join(', ')}). 생략하면 전체.`,
      inputSchema: { topic: z.enum(GUIDE_TOPICS as [GuideTopic, ...GuideTopic[]]).optional() },
    },
    safe(({ topic }) => text(getProfileGuide(topic))),
  );
  server.registerTool(
    'get_profile_schema',
    { title: '프로필 JSON Schema', description: '프로필 파일의 JSON Schema', inputSchema: {} },
    safe(() => text(buildProfileSchema() as Record<string, unknown>)),
  );
  server.registerTool(
    'check_profile',
    {
      title: '프로필 점검',
      description:
        '프로필(YAML)을 문법·스키마·양식 대조로 점검한다. 오류는 code·path·line·candidates를 가지므로 후보 중에서 골라 고친 뒤 다시 호출한다. profile_path 또는 profile_yaml+template_path.',
      inputSchema: {
        profile_path: z.string().optional(),
        profile_yaml: z.string().optional(),
        template_path: z.string().optional(),
      },
    },
    safe(async ({ profile_path, profile_yaml, template_path }) => {
      if (profile_path) {
        const p = loadProfile(guard, profile_path);
        const issues: Issue[] = [...p.loaded.issues];
        if (p.loaded.profile && p.template)
          issues.push(
            ...(
              await checkProfile(rhwpEngine, p.loaded.profile, p.template, {
                lineOf: p.loaded.lineOf,
                dataSchema: p.schema,
              })
            ).issues,
          );
        return text({ ok: !issues.some((i) => i.severity === 'error'), issues });
      }
      if (!profile_yaml || !template_path) throw new Error('profile_path 또는 profile_yaml+template_path가 필요함');
      const { parseProfile } = await import('@yangsik/core');
      const parsed = parseProfile(profile_yaml);
      if (!parsed.profile) return text({ ok: false, issues: parsed.issues });
      const r = await checkProfile(
        rhwpEngine,
        parsed.profile,
        new Uint8Array(readFileSync(guard.read(template_path))),
        { lineOf: parsed.lineOf },
      );
      return text({ ok: r.ok, issues: [...parsed.issues, ...r.issues] });
    }),
  );
  server.registerTool(
    'test_profile',
    {
      title: '프로필 드라이런',
      description:
        '예제 md로 실제 변환해 자체 검증과 양식 라벨 ↔ md 값 대조표를 준다. 점검을 통과해도 결과가 맞다는 보장은 아니므로 이 결과로 확인한다.',
      inputSchema: {
        profile_path: z.string(),
        example_md_path: z.string().optional().describe('생략하면 프로필 폴더의 example.md'),
      },
    },
    safe(async ({ profile_path, example_md_path }) => {
      const p = loadProfile(guard, profile_path);
      if (p.errors.length || !p.loaded.profile || !p.template) return text({ ok: false, issues: p.loaded.issues });
      const md = example_md_path ?? join(p.loaded.dir, 'example.md');
      const r = await testProfile(rhwpEngine, {
        profile: p.loaded.profile,
        template: p.template,
        exampleMd: readFileSync(guard.read(md), 'utf8'),
        dataSchema: p.schema,
      });
      return text({ ...r });
    }),
  );
  server.registerTool(
    'preview_mapping',
    {
      title: '매핑 대조표',
      description: '양식 라벨 ↔ md 값 대조표(변환 전 미리보기)',
      inputSchema: { profile_path: z.string(), md_path: z.string().optional(), md_text: z.string().optional() },
    },
    safe(async (a) => {
      const p = loadProfile(guard, a.profile_path);
      if (p.errors.length || !p.loaded.profile || !p.template) return text({ ok: false, issues: p.loaded.issues });
      return text({ ...(await previewMapping(rhwpEngine, p.loaded.profile, mdInput(guard, a).text, p.template)) });
    }),
  );

  // ---- 변환 도구 (md 작성 → 검증 → 수정 → 변환) --------------------------------------------------
  server.registerTool(
    'list_doctypes',
    {
      title: '문서 유형 목록',
      description: '허용 폴더 안의 문서 유형(profile.yaml이 있는 폴더)을 찾는다.',
      inputSchema: {},
    },
    safe(() => {
      const found: Record<string, unknown>[] = [];
      const walk = (dir: string, depth: number) => {
        if (depth > 3) return;
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
          const full = join(dir, e.name);
          if (e.isDirectory()) walk(full, depth + 1);
          else if (e.name === 'profile.yaml') {
            let file: string;
            try {
              file = guard.read(full); // 허용 폴더 밖을 가리키는 링크·끊어진 링크는 건너뛴다
            } catch {
              continue;
            }
            const l = loadProfileFile(file);
            found.push({
              type: l.profile?.type,
              name: l.profile?.name,
              profilePath: full,
              hasExample: existsSync(join(dir, 'example.md')),
              hasSchema: !!l.profile?.schema,
              profileOk: !!l.profile,
            });
          }
        }
      };
      for (const r of guard.roots) walk(r, 0);
      return text({ doctypes: found });
    }),
  );
  server.registerTool(
    'get_md_template',
    {
      title: 'md 작성 지침',
      description:
        '문서 유형의 md 작성 규칙(제목 패턴·슬롯), 규약(JSON Schema), 예제 md를 준다. 이 규칙대로 md를 쓰고 validate_md로 확인한다.',
      inputSchema: { profile_path: z.string() },
    },
    safe(({ profile_path }) => {
      const p = loadProfile(guard, profile_path);
      if (!p.loaded.profile) return text({ ok: false, issues: p.loaded.issues });
      const ex = join(p.loaded.dir, 'example.md');
      const example = (() => {
        try {
          return readFileSync(guard.read(ex), 'utf8');
        } catch {
          return null;
        }
      })();
      return text({
        type: p.loaded.profile.type,
        rules: mdRules(p.loaded.profile),
        schema: p.schema,
        example,
      });
    }),
  );
  server.registerTool(
    'validate_md',
    {
      title: 'md 규약 검사',
      description:
        'md가 프로필의 규칙·규약에 맞는지 검사한다. 위반은 줄 번호·경로·메시지로 돌려주므로 고쳐서 다시 호출한다.',
      inputSchema: { profile_path: z.string(), md_path: z.string().optional(), md_text: z.string().optional() },
    },
    safe(({ profile_path, md_path, md_text }) => {
      const p = loadProfile(guard, profile_path);
      if (p.errors.length || !p.loaded.profile) return text({ ok: false, profileIssues: p.loaded.issues });
      const m = mdInput(guard, { md_path, md_text });
      const md = readMarkdown(p.loaded.profile, m.text);
      const violations = [
        ...md.violations,
        ...(p.schema ? validateData(md.data, p.schema, md.lines, md.violations) : []),
      ].sort((a, z) => a.line - z.line);
      return text({
        ok: violations.length === 0,
        violations,
        warnings: md.warnings,
        formatted: violations.length ? formatViolations(m.name, violations) : '',
      });
    }),
  );
  server.registerTool(
    'convert_md',
    {
      title: 'md → HWPX(·HWP) 변환',
      description:
        'md를 프로필의 양식으로 변환해 out_path(.hwpx)에 저장하고 자체 검증 보고를 돌려준다. formats에 "hwp"를 넣으면 같은 이름의 .hwp(HWP 5.0)도 저장한다(HWPX와 일치 검증을 통과한 경우만). md 위반은 ok:false와 violations로, 프로필 오류는 issues로 돌려준다.',
      inputSchema: {
        profile_path: z.string(),
        md_path: z.string().optional(),
        md_text: z.string().optional(),
        out_path: z.string().describe('저장할 .hwpx 경로(허용 폴더 안)'),
        skip_diagrams: z.boolean().optional(),
        formats: z
          .array(z.enum(['hwpx', 'hwp']))
          .optional()
          .describe('기본 ["hwpx"]. "hwp"를 넣으면 .hwp도 저장'),
      },
    },
    safe(async ({ profile_path, md_path, md_text, out_path, skip_diagrams, formats }) => {
      // 프로필·양식·규약·md는 모두 PathGuard를 거쳐 읽고, 저장 위치도 확인한 뒤에만 쓴다.
      const out = guard.write(out_path, ['.hwpx']);
      const wantHwp = formats?.includes('hwp') ?? false;
      const outHwp = wantHwp ? guard.write(hwpPathOf(out), ['.hwp']) : undefined;
      const p = loadProfile(guard, profile_path);
      if (p.errors.length || !p.loaded.profile) return text({ ok: false, issues: p.loaded.issues });
      if (!p.template) return text({ ok: false, issues: p.loaded.issues });
      const m = mdInput(guard, { md_path, md_text });
      const diagrams = !(skip_diagrams || findChromium() === null);
      const work = diagrams ? mkdtempSync(join(tmpdir(), 'yangsik-mcp-')) : undefined;
      try {
        const {
          bytes,
          hwp,
          report: r,
        } = await convertBytes(rhwpEngine, {
          profile: p.loaded.profile,
          mdText: m.text,
          mdName: m.name,
          template: p.template,
          dataSchema: p.schema,
          renderDiagram: work ? async (src, name) => renderMermaid(src, work, name) : undefined,
          skipDiagrams: !diagrams,
          formats: wantHwp ? ['hwpx', 'hwp'] : ['hwpx'],
        });
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, bytes);
        // 검증을 통과한 HWP만 쓴다
        const wroteHwp = !!(outHwp && hwp && r.hwp?.ok);
        if (outHwp && hwp && wroteHwp) writeFileSync(outHwp, hwp);
        return text({
          ok: r.verify.ok && (r.hwp?.ok ?? true),
          out: relative(guard.roots[0], out),
          ...(wantHwp
            ? {
                outHwp: wroteHwp && outHwp ? relative(guard.roots[0], outHwp) : null,
                hwp: {
                  ok: r.hwp?.ok ?? false,
                  failedChecks: r.hwp?.checks.filter((c) => !c.ok) ?? [],
                  error: r.hwp?.error,
                },
              }
            : {}),
          pages: r.pages,
          items: r.items,
          cellsSet: r.cellsSet,
          imagesInserted: r.imagesInserted,
          failedChecks: r.verify.checks.filter((c) => !c.ok),
          warnings: r.warnings,
          issues: r.issues,
          mermaid: diagrams,
        });
      } catch (e) {
        if (e instanceof ValidationError) return text({ ok: false, violations: e.violations, formatted: e.message });
        if (e instanceof ProfileError) return text({ ok: false, issues: e.issues });
        throw e;
      } finally {
        if (work) rmSync(work, { recursive: true, force: true });
      }
    }),
  );
  server.registerTool(
    'preview_output',
    {
      title: '출력 미리보기(쪽별 SVG)',
      description: '변환한 .hwpx의 한 쪽을 SVG로 그려 준다(rhwp 렌더링, 한컴과 다를 수 있음).',
      inputSchema: { file_path: z.string(), page: z.number().int().min(0).optional() },
    },
    safe(async ({ file_path, page }) => {
      const s = await rhwpEngine.open(new Uint8Array(readFileSync(guard.read(file_path))));
      try {
        const pages = s.pageCount();
        const p = page ?? 0;
        if (p >= pages) throw new Error(`쪽 번호가 범위를 벗어남 (0~${pages - 1})`);
        return text({ pages, page: p, svg: s.renderSvg(p) });
      } finally {
        s.dispose();
      }
    }),
  );

  return server;
}
