import { basename } from 'node:path';
import { formatViolations, readMarkdown, validateData } from '@yangsik/core';
import { loadProfileFile } from '@yangsik/core/node';
import { EXIT, formatIssues, type Out, readText, UsageError, worst } from '../util';

export const validateOptions = {
  profile: { type: 'string', short: 'p' },
  strict: { type: 'boolean' },
  json: { type: 'boolean' },
} as const;

export async function validate(files: string[], v: { profile?: string; strict?: boolean }, out: Out): Promise<number> {
  if (!files.length || !v.profile) throw new UsageError('사용: yangsik validate <md...> -p <profile.yaml>');
  const loaded = loadProfileFile(v.profile);
  const errors = loaded.issues.filter((i) => i.severity === 'error');
  if (errors.length || !loaded.profile) {
    out.err(formatIssues(basename(v.profile), errors));
    out.data({ ok: false, profileIssues: errors });
    return EXIT.input;
  }
  const schema = loaded.schemaPath ? (JSON.parse(readText(loaded.schemaPath)) as object) : undefined;
  const results = files.map((file) => {
    const md = readMarkdown(loaded.profile as NonNullable<typeof loaded.profile>, readText(file));
    const vs = [...md.violations, ...(schema ? validateData(md.data, schema, md.lines, md.violations) : [])].sort(
      (a, b) => a.line - b.line,
    );
    if (vs.length) out.err(formatViolations(file, vs));
    else out.info(`OK  ${file}${md.warnings.length ? ` (경고 ${md.warnings.length}건)` : ''}`);
    for (const w of md.warnings) out.info(`  ⚠ ${file}:${w.line}  ${w.message}`);
    const code = vs.length ? EXIT.input : v.strict && md.warnings.length ? EXIT.strict : EXIT.ok;
    return { file, ok: !vs.length, violations: vs, warnings: md.warnings, code };
  });
  out.data({ ok: results.every((r) => r.ok), files: results.map(({ code: _c, ...r }) => r) });
  return worst(results.map((r) => r.code));
}
