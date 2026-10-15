import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { formatViolations, ProfileError, readMarkdown, ValidationError, validateData } from '@yangsik/core';
import { convert, findChromium, loadProfileFile, rhwpEngine } from '@yangsik/core/node';

// 명령 체계는 I-4에서 재설계한다. 지금은 프로필(--profile)로 구동하는 최소 명령만 둔다.
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    md: { type: 'string' },
    profile: { type: 'string' },
    template: { type: 'string' },
    out: { type: 'string' },
    preview: { type: 'string' },
    'no-mermaid': { type: 'boolean' },
    json: { type: 'boolean' },
  },
});

const cmd = positionals[0];

async function main(): Promise<number> {
  switch (cmd) {
    case 'check': {
      const s = await rhwpEngine.open();
      console.log(`rhwp ${rhwpEngine.version} 로드 OK, 빈 문서 쪽수 ${s.pageCount()}, 스타일 ${s.analyze().styles}개`);
      s.dispose();
      console.log(`Chromium: ${findChromium() ?? '없음 (Mermaid 불가)'}`);
      return 0;
    }
    case 'validate': {
      if (!values.md || !values.profile) throw new Error('--md --profile 필요');
      const loaded = loadProfileFile(values.profile);
      if (!loaded.profile) throw new ProfileError(loaded.issues);
      const md = readMarkdown(loaded.profile, readFileSync(values.md, 'utf8'));
      const schema = loaded.schemaPath ? (JSON.parse(readFileSync(loaded.schemaPath, 'utf8')) as object) : undefined;
      const vs = [...md.violations, ...(schema ? validateData(md.data, schema, md.lines, md.violations) : [])].sort(
        (a, b) => a.line - b.line,
      );
      if (vs.length) {
        console.error(formatViolations(values.md, vs));
        return 1;
      }
      console.log(`OK: 경고 ${md.warnings.length}건`);
      return 0;
    }
    case 'analyze': {
      if (!values.template) throw new Error('--template 필요');
      const s = await rhwpEngine.open(new Uint8Array(readFileSync(values.template)));
      console.log(JSON.stringify(s.analyze(), null, 2));
      s.dispose();
      return 0;
    }
    case 'convert': {
      if (!values.md || !values.profile || !values.out) throw new Error('--md --profile --out 필요');
      try {
        const r = await convert(rhwpEngine, {
          mdPath: values.md,
          profilePath: values.profile,
          outPath: values.out,
          skipMermaid: values['no-mermaid'],
          previewDir: values.preview,
        });
        if (values.json) console.log(JSON.stringify(r, null, 2));
        else {
          console.log(
            `출력: ${r.out}  (${r.pages}쪽, 항목 ${r.items}건, 복제 ${r.cloned}, 셀 ${r.cellsSet}, 그림 ${r.imagesInserted})`,
          );
          for (const c of r.verify.checks)
            console.log(`  ${c.ok ? '✔' : '✘'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
          for (const w of r.warnings) console.log(`  ⚠ ${w}`);
          console.log(`  시간(ms): ${JSON.stringify(r.timingsMs)}`);
        }
        return r.verify.ok ? 0 : 2;
      } catch (e) {
        if (e instanceof ValidationError || e instanceof ProfileError) {
          console.error(e.message);
          return 1;
        }
        throw e;
      }
    }
    default:
      console.error(
        '사용법: yangsik <check|validate|analyze|convert> [--profile f] [--md f] [--template f] [--out f] [--preview dir] [--no-mermaid] [--json]',
      );
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(3);
  },
);
