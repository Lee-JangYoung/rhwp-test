import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { type ConvertReport, ProfileError, ValidationError } from '@yangsik/core';
import { convert, rhwpEngine } from '@yangsik/core/node';
import { EXIT, formatIssues, inputErrorMessage, type Out, UsageError, worst } from '../util';

export const convertOptions = {
  profile: { type: 'string', short: 'p' },
  out: { type: 'string', short: 'o' },
  report: { type: 'string' },
  preview: { type: 'string' },
  'no-mermaid': { type: 'boolean' },
  strict: { type: 'boolean' },
  json: { type: 'boolean' },
} as const;

interface V {
  profile?: string;
  out?: string;
  report?: string;
  preview?: string;
  'no-mermaid'?: boolean;
  strict?: boolean;
}

/** 출력 경로: 하나뿐이고 -o가 .hwpx면 그 파일, 아니면 -o(기본 out)를 폴더로 보고 md 이름을 따른다 */
const outPathFor = (md: string, all: string[], o: string | undefined): string =>
  all.length === 1 && o && extname(o) === '.hwpx' ? o : join(o ?? 'out', `${basename(md, extname(md))}.hwpx`);

export async function convertCmd(files: string[], v: V, out: Out): Promise<number> {
  if (!files.length || !v.profile)
    throw new UsageError('사용: yangsik convert <md...> -p <profile.yaml> [-o 출력(.hwpx 또는 폴더)]');
  const results: { file: string; code: number; report?: ConvertReport & { out: string }; error?: unknown }[] = [];
  // 같은 이름의 md가 여러 개면 출력이 서로 덮어쓰므로 시작 전에 막는다
  const outs = new Map<string, string>();
  for (const file of files) {
    const o = outPathFor(file, files, v.out);
    const prev = outs.get(o);
    if (prev)
      throw new UsageError(`출력 파일이 겹침: ${prev}, ${file} → ${o} (이름이 다른 md로 바꾸거나 따로 변환하세요)`);
    outs.set(o, file);
  }
  for (const file of files) {
    const outPath = outPathFor(file, files, v.out);
    try {
      const r = await convert(rhwpEngine, {
        mdPath: file,
        profilePath: v.profile,
        outPath,
        skipMermaid: v['no-mermaid'],
        previewDir: v.preview
          ? files.length > 1
            ? join(v.preview, basename(file, extname(file)))
            : v.preview
          : undefined,
      });
      const warned = r.warnings.length > 0 || r.issues.some((i) => i.severity === 'warning');
      out.info(
        `${r.verify.ok ? '✔' : '✘'} ${file} → ${r.out}  (${r.pages}쪽, 항목 ${r.items}건, 복제 ${r.cloned}, 셀 ${r.cellsSet}, 그림 ${r.imagesInserted})`,
      );
      for (const c of r.verify.checks.filter((c) => !c.ok))
        out.info(`    ✘ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
      for (const w of r.warnings) out.info(`    ⚠ ${w}`);
      for (const i of r.issues.filter((i) => i.severity === 'warning'))
        out.info(`    ⚠ [${i.code}] ${i.path} — ${i.message}`);
      results.push({ file, report: r, code: !r.verify.ok ? EXIT.verify : v.strict && warned ? EXIT.strict : EXIT.ok });
    } catch (e) {
      if (e instanceof ValidationError) {
        out.err(`✘ ${file}\n${e.message}`);
        results.push({ file, code: EXIT.input, error: { violations: e.violations } });
      } else if (e instanceof ProfileError) {
        out.err(`✘ ${file}\n${formatIssues(v.profile, e.issues)}`);
        results.push({ file, code: EXIT.input, error: { issues: e.issues } });
      } else {
        const msg = inputErrorMessage(e);
        if (msg === null) throw e;
        // 입력 문제는 그 파일만 실패로 기록하고 나머지를 계속 변환한다 (요약·보고서는 항상 남긴다)
        out.err(`✘ ${file}\n${msg}`);
        results.push({ file, code: EXIT.input, error: { message: msg } });
      }
    }
  }
  const summary = { ok: results.every((r) => r.code === EXIT.ok), files: results };
  if (v.report) {
    mkdirSync(dirname(v.report), { recursive: true });
    writeFileSync(v.report, JSON.stringify(summary, null, 2));
  }
  out.data(summary);
  return worst(results.map((r) => r.code));
}
