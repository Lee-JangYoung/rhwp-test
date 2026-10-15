// 독립 검토(S-29)에서 재현된 결함의 회귀 시험. 각 시험은 수정 전에 실패했다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { convertBytes, type Profile, parseProfile, ProfileError, readMarkdown, testProfile } from '../src/index';
import { getPath as getPathForTest } from '../src/convert/values';
import { createBlankDoc, rhwpEngine } from '../src/node/index';
import { fakeDiagram } from './util/zip';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const profileOf = (text: string): Profile => {
  const r = parseProfile(text);
  if (!r.profile) throw new Error(JSON.stringify(r.issues));
  return r.profile;
};

/** 표 여러 개를 가진 합성 양식을 만든다. cells는 행 단위 텍스트 */
function template(
  tables: { rows: number; cols: number; cells: string[]; merge?: [number, number, number, number] }[],
): Uint8Array {
  const d = createBlankDoc();
  d.insertText(0, 0, 0, '양식');
  for (const t of tables) {
    const p = d.getParagraphCount(0);
    d.insertParagraph(0, p);
    const tp = d.getParagraphCount(0);
    d.insertParagraph(0, tp);
    const r = JSON.parse(d.createTable(0, tp, 0, t.rows, t.cols)) as { paraIdx: number; controlIdx: number };
    d.setTableProperties(0, r.paraIdx, r.controlIdx, JSON.stringify({ treatAsChar: true }));
    for (const [i, text] of t.cells.entries()) if (text) d.insertTextInCell(0, r.paraIdx, r.controlIdx, i, 0, 0, text);
    if (t.merge) d.mergeTableCells(0, r.paraIdx, r.controlIdx, ...t.merge);
  }
  const bytes = new Uint8Array(d.exportHwpx());
  d.free();
  return bytes;
}
const kv = (...labels: string[]) => ({ rows: labels.length, cols: 2, cells: labels.flatMap((l) => [l, '(입력)']) });

async function tablesOf(bytes: Uint8Array): Promise<string[][][]> {
  const s = await rhwpEngine.open(bytes);
  const out = s.topTables().map((t) => {
    const cells = s.tableCells(t);
    const rows = Math.max(...cells.map((c) => c.row)) + 1;
    return Array.from({ length: rows }, (_, r) =>
      cells
        .filter((c) => c.row === r)
        .sort((a, z) => a.col - z.col)
        .map((c) => c.text),
    );
  });
  s.dispose();
  return out;
}
const HEAD = 'version: 1\ntype: t\ntemplate: t.hwpx\n';
const MD3 = '## 가\n\n## 나\n\n## 다\n';

describe('점검과 실행이 같은 표를 가리킨다 (table.index)', () => {
  it('repeat이 표를 복제한 뒤에도 index는 양식의 표 번호다', async () => {
    const tpl = template([kv('항목명', '비고'), kv('보조명', '비고'), kv('총평', '비고')]);
    const p = profileOf(`${HEAD}md:
  collections:
    items: { heading: { level: 2, pattern: '{name}' } }
bindings:
  - kind: repeat
    over: items
    unit: { range: { start: { table: { label: 항목명 } }, end: { table: { label: 보조명 } } } }
    do:
      - { kind: cells, in: { table: { label: 항목명 } }, map: { 항목명: '{name}', 비고: x } }
      - { kind: cells, in: { table: { label: 보조명 } }, map: { 보조명: '{name}', 비고: y } }
  - { kind: cells, in: { table: { index: 2 } }, map: { 총평: 끝, 비고: FOOTER } }
`);
    const { bytes, report } = await convertBytes(rhwpEngine, { profile: p, mdText: MD3, template: tpl });
    expect(report.verify.checks.filter((c) => !c.ok)).toEqual([]);
    const t = await tablesOf(bytes);
    expect(t).toHaveLength(7);
    expect(t[6]).toEqual([
      ['총평', '끝'],
      ['비고', 'FOOTER'],
    ]);
    expect(
      t
        .slice(0, 6)
        .flat()
        .some((r) => r[1] === 'FOOTER'),
    ).toBe(false);
  });
});

describe('같은 표를 여러 cells가 채운다', () => {
  it('뒤 바인딩이 앞 바인딩의 값을 지우지 않는다', async () => {
    const tpl = template([kv('테이블명', '설명', '비고')]);
    const p = profileOf(`${HEAD}md:
  frontMatter: meta
  collections: {}
bindings:
  - { kind: cells, in: { table: { label: 테이블명 } }, map: { 테이블명: '{meta.name}' } }
  - { kind: cells, in: { table: { label: 테이블명 } }, map: { 설명: '{meta.desc}' }, unmappedValue: keep }
`);
    const { bytes, report } = await convertBytes(rhwpEngine, {
      profile: p,
      mdText: '---\nname: N\ndesc: D\n---\n',
      template: tpl,
    });
    expect(report.verify.checks.filter((c) => !c.ok)).toEqual([]);
    expect((await tablesOf(bytes))[0]).toEqual([
      ['테이블명', 'N'],
      ['설명', 'D'],
      ['비고', ''],
    ]);
    // clear(기본)인 두 번째 바인딩도 앞서 채운 값은 지우지 않는다
    const p2 = profileOf(`${HEAD}md:
  frontMatter: meta
  collections: {}
bindings:
  - { kind: cells, in: { table: { label: 테이블명 } }, map: { 테이블명: '{meta.name}' } }
  - { kind: cells, in: { table: { label: 테이블명 } }, map: { 설명: '{meta.desc}' } }
`);
    const r2 = await convertBytes(rhwpEngine, { profile: p2, mdText: '---\nname: N\ndesc: D\n---\n', template: tpl });
    expect(r2.report.verify.ok).toBe(true);
    expect((await tablesOf(r2.bytes))[0]).toEqual([
      ['테이블명', 'N'],
      ['설명', 'D'],
      ['비고', ''],
    ]);
  });
});

describe('같은 라벨·머리글이 여러 개면 점검이 거부한다', () => {
  it('cells 라벨 중복, rows 머리글 중복', async () => {
    const dupLabel = template([{ rows: 3, cols: 2, cells: ['항목', 'X', '비고', 'v1', '비고', 'v2'] }]);
    const p = profileOf(`${HEAD}md:
  collections: {}
bindings:
  - { kind: cells, in: { table: { index: 0 } }, map: { 비고: N } }
`);
    const r = await testProfile(rhwpEngine, { profile: p, template: dupLabel, exampleMd: '' });
    expect(r.check.issues.map((i) => i.code)).toContain('label-ambiguous');
    await expect(convertBytes(rhwpEngine, { profile: p, mdText: '', template: dupLabel })).rejects.toBeInstanceOf(
      ProfileError,
    );

    const dupHeader = template([{ rows: 2, cols: 3, cells: ['이름', '비고', '비고', '(a)', '(b)', '(c)'] }]);
    const p2 = profileOf(`${HEAD}md:
  collections:
    rows: { heading: { level: 2, pattern: '{n}' } }
bindings:
  - { kind: rows, in: { table: { index: 0 } }, over: rows, columns: { 이름: '{n}', 비고: '{n}' } }
`);
    const r2 = await testProfile(rhwpEngine, { profile: p2, template: dupHeader, exampleMd: '## a\n' });
    expect(r2.check.issues.map((i) => i.code)).toContain('label-ambiguous');
  });
});

describe('값 모델', () => {
  const uc = (n: string) => ({
    profileText: readFileSync(at(`../../../templates/${n}/profile.yaml`), 'utf8'),
    template: new Uint8Array(readFileSync(at(`../../../templates/${n}/template.hwpx`))),
    md: readFileSync(at(`../../../templates/${n}/example.md`), 'utf8'),
    schema: JSON.parse(readFileSync(at(`../../../templates/${n}/schema.json`), 'utf8')) as object,
  });

  it('front-matter 값은 문자열로 보존한다 (1.10 → 1.1이 되지 않음)', async () => {
    const c = uc('usecase');
    const md = c.md.replace('version: "1.0"', 'version: 1.10').replace('date: 2026-10-14', 'date: 2026-10-14');
    const { bytes } = await convertBytes(rhwpEngine, {
      profile: profileOf(c.profileText),
      mdText: md,
      template: c.template,
      dataSchema: c.schema,
      skipDiagrams: true,
    });
    const s = await rhwpEngine.open(bytes);
    expect(s.getField('버전')).toBe('1.10');
    s.dispose();
  });

  it('없는 선택 슬롯은 바깥 범위의 같은 이름 값을 끌어오지 않는다', () => {
    const p = profileOf(`${HEAD}md:
  collections:
    classes:
      heading: { level: 2, pattern: '{name}' }
      slots:
        - { as: list, key: note, under: 비고, optional: true }
      children:
        methods:
          heading: { level: 3, pattern: '{name}' }
          slots:
            - { as: list, key: note, under: 메모, optional: true }
bindings:
  - { kind: fields, map: { classes: x } }
`);
    const r = readMarkdown(p, '## A\n\n### 비고\n\n- 클래스 비고\n\n### m1\n');
    const m = (r.data.classes as { methods: Record<string, unknown>[] }[])[0].methods[0];
    expect(Object.hasOwn(m, 'note')).toBe(true);
    expect(m.note).toBeUndefined();
    expect(getPathForTest([m, (r.data.classes as Record<string, unknown>[])[0]], 'note')).toBeUndefined();
  });

  it("md 표 머리글에 '.'가 있어도(No.) 값을 쓸 수 있다", async () => {
    const tpl = template([{ rows: 2, cols: 2, cells: ['번호', '이름', '(번호)', '(이름)'] }]);
    const p = profileOf(`${HEAD}md:
  collections:
    c:
      heading: { level: 2, pattern: '{n}' }
      slots:
        - { as: records, key: r }
bindings:
  - { kind: repeat, over: c, unit: { table: { index: 0 } }, do: [{ kind: rows, over: r, columns: { 번호: '{No.}', 이름: '{이름}' } }] }
`);
    const { bytes, report } = await convertBytes(rhwpEngine, {
      profile: p,
      mdText: '## A\n\n| No. | 이름 |\n|---|---|\n| 1 | 가 |\n| 2 | 나 |\n',
      template: tpl,
    });
    expect(report.verify.ok).toBe(true);
    expect((await tablesOf(bytes))[0]).toEqual([
      ['번호', '이름'],
      ['1', '가'],
      ['2', '나'],
    ]);
  });

  it('kv 키가 constructor·toString이어도 중복으로 오인하거나 객체를 오염시키지 않는다', () => {
    const p = profileOf(`${HEAD}md:
  collections:
    c:
      heading: { level: 2, pattern: '{n}' }
      slots:
        - { as: kv, key: f }
bindings:
  - { kind: fields, map: { c: x } }
`);
    const r = readMarkdown(
      p,
      '## A\n\n| 항목 | 내용 |\n|---|---|\n| constructor | 1 |\n| toString | 3 |\n| hasOwnProperty | 4 |\n',
    );
    expect(r.violations).toEqual([]);
    const f = (r.data.c as { f: Record<string, string> }[])[0].f;
    expect(Object.keys(f)).toEqual(['constructor', 'toString', 'hasOwnProperty']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('자체 검증과 위치 추적', () => {
  it('양식에 원래 있던 그림은 검증을 실패시키지 않는다', async () => {
    // 표가 있는 양식에 그림을 하나 넣어 둔다
    const base = template([kv('항목', '비고')]);
    const s = await rhwpEngine.open(base);
    const d = await fakeDiagram();
    s.insertImageAfter(s.topTables()[0], { bytes: d.bytes, widthPx: d.widthPx, heightPx: d.heightPx, alt: '로고' });
    const withLogo = s.export();
    s.dispose();
    const p = profileOf(`${HEAD}md:
  frontMatter: meta
  collections: {}
bindings:
  - { kind: cells, in: { table: { index: 0 } }, map: { 항목: '{meta.a}' } }
`);
    const { report } = await convertBytes(rhwpEngine, { profile: p, mdText: '---\na: 값\n---\n', template: withLogo });
    expect(report.verify.checks.filter((c) => !c.ok)).toEqual([]);
  });

  it('repeat 밖에서 cells로 채운 표의 행·표를 remove해도 검증이 맞다', async () => {
    const tpl = template([kv('항목', '비고'), kv('별첨', '내용')]);
    const p = profileOf(`${HEAD}md:
  frontMatter: meta
  collections: {}
bindings:
  - { kind: cells, in: { table: { index: 0 } }, map: { 항목: '{meta.a}' } }
  - { kind: cells, in: { table: { index: 1 } }, map: { 별첨: '{meta.a}' } }
  - { kind: remove, in: { table: { index: 0 } }, target: { row: { label: 비고 } }, when: 'empty(meta.none)' }
  - { kind: remove, target: { table: { index: 1 } }, when: 'empty(meta.none)' }
`);
    const { bytes, report } = await convertBytes(rhwpEngine, {
      profile: p,
      mdText: '---\na: 값\n---\n',
      template: tpl,
    });
    expect(report.verify.checks.filter((c) => !c.ok)).toEqual([]);
    expect(await tablesOf(bytes)).toEqual([[['항목', '값']]]);
  });

  it('3단 중첩에서도 diagrams는 바깥 단위의 마지막 표 뒤에 들어간다', async () => {
    const tpl = template([kv('외부'), kv('중간'), kv('잎')]);
    const p = profileOf(`${HEAD}md:
  collections:
    a:
      heading: { level: 2, pattern: '{n}' }
      slots:
        - { as: code, key: d, lang: mermaid }
      children:
        b:
          heading: { level: 3, pattern: '{n}' }
          children:
            c:
              heading: { level: 4, pattern: '{n}' }
bindings:
  - kind: repeat
    over: a
    unit: { range: { start: { table: { label: 외부 } }, end: { table: { label: 잎 } } } }
    do:
      - { kind: cells, in: { table: { label: 외부 } }, map: { 외부: '{n}' } }
      - kind: repeat
        over: b
        unit: { range: { start: { table: { label: 중간 } }, end: { table: { label: 잎 } } } }
        do:
          - { kind: cells, in: { table: { label: 중간 } }, map: { 중간: '{n}' } }
          - kind: repeat
            over: c
            unit: { table: { label: 잎 } }
            do:
              - { kind: cells, map: { 잎: '{n}' } }
      - { kind: diagrams, from: d }
`);
    const md = '## A1\n\n```mermaid\ngraph TD\n```\n\n### B1\n\n#### C1\n\n#### C2\n\n### B2\n\n#### C3\n';
    const { bytes, report } = await convertBytes(rhwpEngine, {
      profile: p,
      mdText: md,
      template: tpl,
      renderDiagram: fakeDiagram,
    });
    expect(report.verify.checks.filter((c) => !c.ok)).toEqual([]);
    const s = await rhwpEngine.open(bytes);
    // 그림은 문서의 마지막(잎 표 뒤)에 있어야 한다: 마지막 표 문단 바로 뒤 문단이 그림
    const last = s.topTables().at(-1);
    expect(last).toBeDefined();
    expect(s.tableCells(last as NonNullable<typeof last>).map((c) => c.text)).toEqual(['잎', 'C3']);
    expect(s.pictureLayouts()).toHaveLength(1);
    s.dispose();
  });
});

describe('세로 병합이 있는 견본 행은 조용히 값을 잃지 않고 오류로 알린다', () => {
  it('rows가 merged-cell 오류를 낸다', async () => {
    const tpl = template([
      { rows: 4, cols: 2, cells: ['ID', '이름', '(a)', '(b)', '', '(d)', '합계', ''], merge: [1, 0, 2, 0] },
    ]);
    const p = profileOf(`${HEAD}md:
  collections:
    r:
      heading: { level: 2, pattern: '{n}' }
bindings:
  - { kind: rows, in: { table: { index: 0 } }, over: r, columns: { ID: '{n}', 이름: '{n}' } }
`);
    const err = await convertBytes(rhwpEngine, { profile: p, mdText: '## a\n\n## b\n\n## c\n', template: tpl }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ProfileError);
    expect((err as ProfileError).issues.map((i) => i.code)).toContain('merged-cell');
  });
});
