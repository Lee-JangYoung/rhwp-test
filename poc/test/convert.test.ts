import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { convert, ValidationError } from '../src/convert';
import { rhwpEngine } from '../src/engine/rhwp-node';
import { findChromium } from '../src/mermaid';
import { parseMarkdown } from '../src/parse';
import { validateIr } from '../src/validate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCHEMA = join(ROOT, 'schemas/usecase.schema.json');
const TEMPLATE = join(ROOT, 'fixtures/templates/usecase-synthetic.hwpx');
const md = (n: string) => join(ROOT, 'fixtures/md', n);
const OUT = join(ROOT, 'out/test');
mkdirSync(OUT, { recursive: true });

const opts = (mdName: string, out: string, extra: object = {}) => ({
  mdPath: md(mdName),
  templatePath: TEMPLATE,
  outPath: join(OUT, out),
  schemaPath: SCHEMA,
  workDir: join(OUT, 'work'),
  ...extra,
});

describe('P1 md 파싱·규약 검증', () => {
  it('정상 문서는 위반이 없다', () => {
    const ir = parseMarkdown(readFileSync(md('usecase-ok.md'), 'utf8'));
    expect(ir.items.map((i) => i.id)).toEqual(['UC-001', 'UC-002', 'UC-003']);
    expect(validateIr(ir, JSON.parse(readFileSync(SCHEMA, "utf8")))).toEqual([]);
  });

  it('위반 1: ID 형식과 필수 항목 누락을 줄 번호와 함께 알려준다', () => {
    const vs = validateIr(parseMarkdown(readFileSync(md('usecase-bad1.md'), "utf8")), JSON.parse(readFileSync(SCHEMA, "utf8")));
    expect(vs.map((v) => [v.line, v.path, v.message])).toEqual([
      [8, '/items/0/id', expect.stringContaining('형식 불일치')],
      [10, '/items/0/fields', '필수 항목 누락: 사후조건'],
    ]);
  });

  it('위반 2: front-matter 누락·형식, 빈 흐름', () => {
    const vs = validateIr(parseMarkdown(readFileSync(md('usecase-bad2.md'), "utf8")), JSON.parse(readFileSync(SCHEMA, "utf8")));
    const msgs = vs.map((v) => v.message).join('|');
    expect(msgs).toContain('필수 항목 누락: author');
    expect(msgs).toContain('형식 불일치');
    expect(vs.some((v) => v.path === '/items/0/flows/main' && v.line === 7)).toBe(true);
  });

  it('위반 문서는 변환을 거부한다', async () => {
    await expect(convert(rhwpEngine, opts('usecase-bad1.md', 'bad.hwpx', { skipMermaid: true }))).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('P2·P3·P5 필드 채움, 반복 블록, 저장 검증', () => {
  it('UC 3건을 표 단위 복제로 만들고 복제본마다 다른 값을 채운다', async () => {
    const r = await convert(rhwpEngine, opts('usecase-ok.md', 'ok.hwpx', { skipMermaid: true }));
    expect(r.cloned).toBe(2);
    expect(r.fieldsSet).toEqual({ 문서명: true, 버전: true, 작성자: true, 작성일: true });
    expect(r.verify.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.verify.ok).toBe(true);
  });

  it('저장 파일을 다시 열어도 블록별 값이 서로 섞이지 않는다', async () => {
    await convert(rhwpEngine, opts('usecase-ok.md', 'ok2.hwpx', { skipMermaid: true }));
    const s = await rhwpEngine.open(new Uint8Array(readFileSync(join(OUT, 'ok2.hwpx'))));
    const ids = s.topTables().map((t) => s.tableCells(t).find((c) => c.row === 0 && c.col === 1)?.text);
    expect(ids).toEqual(['UC-001', 'UC-002', 'UC-003']);
    s.dispose();
  });

  it('표는 쪽 경계에서 나눔(cell)으로 저장되고, 긴 표는 다음 쪽에 이어진다 (떠 있는 표 양식)', async () => {
    const r = await convert(rhwpEngine, opts('usecase-long.md', 'long.hwpx', { skipMermaid: true }));
    expect(r.verify.ok).toBe(true);
    expect(r.pages).toBeGreaterThanOrEqual(2);
    const s = await rhwpEngine.open(new Uint8Array(readFileSync(join(OUT, 'long.hwpx'))));
    expect(s.tableLayouts().every((l) => l.pageBreak === 'cell')).toBe(true);
    expect(s.pageCount()).toBeGreaterThanOrEqual(2);
    s.dispose();
  });

  it('알려진 제약: 글자처럼 취급인 표는 rhwp 조판에서 쪽을 넘겨도 나뉘지 않는다', async () => {
    mkdirSync(join(OUT, 'tpl'), { recursive: true });
    const { execFileSync } = await import('node:child_process');
    const inline = join(OUT, 'tpl/inline.hwpx');
    execFileSync('npx', ['tsx', 'scripts/make-template.ts', inline], { cwd: ROOT, env: { ...process.env, TABLE_INLINE: '1' } });
    const r = await convert(rhwpEngine, { ...opts('usecase-long.md', 'long-inline.hwpx', { skipMermaid: true }), templatePath: inline });
    expect(r.pages).toBe(1); // 긴 표가 한 쪽에 넘쳐 그려진다 (떠 있는 표는 3쪽으로 이어짐)
  });

  it('표 높이 맞춤을 끄면 자체 검증이 낡은 높이를 잡는다', async () => {
    const r = await convert(rhwpEngine, opts('usecase-ok.md', 'stale.hwpx', { skipMermaid: true, fitHeights: false }));
    const c = r.verify.checks.find((x) => x.name.startsWith('표 저장 높이'));
    expect(c?.ok).toBe(false);
  });
});

describe.runIf(findChromium() !== null)('P4 Mermaid → 그림', () => {
  it('다이어그램을 PNG로 렌더해 글자처럼 취급하는 그림으로 넣는다', async () => {
    const r = await convert(rhwpEngine, opts('usecase-ok.md', 'mermaid.hwpx'));
    expect(r.imagesInserted).toBe(1);
    expect(r.diagrams[0].widthPx).toBeGreaterThan(100);
    expect(r.verify.checks.find((c) => c.name.startsWith('그림이 글자처럼'))?.ok).toBe(true);
    expect(r.verify.ok).toBe(true);
    expect(existsSync(join(OUT, 'mermaid.hwpx'))).toBe(true);
  }, 120_000);
});
