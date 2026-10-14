import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { convert, ValidationError } from './convert';
import { rhwpEngine } from './engine/rhwp';
import { findChromium } from './mermaid';
import { parseMarkdown } from './parse';
import { formatViolations, validateIr } from './validate';

const SCHEMA = fileURLToPath(new URL('../schemas/usecase.schema.json', import.meta.url));

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    md: { type: 'string' },
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
      if (!values.md) throw new Error('--md 필요');
      const ir = parseMarkdown(readFileSync(values.md, 'utf8'));
      const vs = validateIr(ir, SCHEMA);
      if (vs.length) {
        console.error(formatViolations(values.md, vs));
        return 1;
      }
      console.log(`OK: UC ${ir.items.length}건, 경고 ${ir.warnings.length}건`);
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
      if (!values.md || !values.template || !values.out) throw new Error('--md --template --out 필요');
      try {
        const r = await convert(rhwpEngine, {
          mdPath: values.md,
          templatePath: values.template,
          outPath: values.out,
          schemaPath: SCHEMA,
          skipMermaid: values['no-mermaid'],
          previewDir: values.preview,
        });
        if (values.json) console.log(JSON.stringify(r, null, 2));
        else {
          console.log(`출력: ${r.out}  (${r.pages}쪽, UC ${r.items}건, 복제 ${r.cloned}, 셀 ${r.cellsSet}, 그림 ${r.imagesInserted})`);
          r.verify.checks.forEach((c) => console.log(`  ${c.ok ? '✔' : '✘'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`));
          r.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
          console.log(`  시간(ms): ${JSON.stringify(r.timingsMs)}`);
        }
        return r.verify.ok ? 0 : 2;
      } catch (e) {
        if (e instanceof ValidationError) {
          console.error(e.message);
          return 1;
        }
        throw e;
      }
    }
    default:
      console.error('사용법: poc <check|validate|analyze|convert> [--md f] [--template f] [--out f] [--preview dir] [--no-mermaid] [--json]');
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
