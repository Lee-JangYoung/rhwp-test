// 합성 양식 2종(클래스 명세서, DB 명세서)을 생성한다. 우리가 직접 만든 샘플이라 저작권 문제가 없다.
// 실제 SI 양식과는 다를 수 있다. 여러 표가 한 문서에 있으므로 표는 "글자처럼 취급"(문단 안)으로 만든다.
//   pnpm --filter @yangsik/core gen:templates
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlankDoc } from '../src/node/index';

type Doc = ReturnType<typeof createBlankDoc>;
const FIELDS = ['문서명', '버전', '작성자', '작성일'];

/** 라벨-값 표(2열) */
const kvTable = (labels: string[]) => ({ rows: labels.length, cols: 2, cells: labels.flatMap((l) => [l, '(입력)']) });
/** 머리행 + 견본 행 한 줄 */
const listTable = (header: string[]) => ({
  rows: 2,
  cols: header.length,
  cells: [...header, ...header.map((h) => `(${h})`)],
});

function make(title: string, tables: { rows: number; cols: number; cells: string[] }[], out: string) {
  const d: Doc = createBlankDoc();
  d.insertText(0, 0, 0, title);
  for (const f of FIELDS) {
    const p = d.getParagraphCount(0);
    d.insertParagraph(0, p);
    d.insertText(0, p, 0, `${f}: `);
    d.insertClickHereField(0, p, f.length + 2, `${f} 입력`, '', f, true);
  }
  for (const t of tables) {
    const blank = d.getParagraphCount(0);
    d.insertParagraph(0, blank); // 표 앞 빈 문단
    const tp = d.getParagraphCount(0);
    d.insertParagraph(0, tp);
    const r = JSON.parse(d.createTable(0, tp, 0, t.rows, t.cols)) as { paraIdx: number; controlIdx: number };
    d.setTableProperties(0, r.paraIdx, r.controlIdx, JSON.stringify({ treatAsChar: true }));
    for (const [i, text] of t.cells.entries()) d.insertTextInCell(0, r.paraIdx, r.controlIdx, i, 0, 0, text);
  }
  const end = d.getParagraphCount(0);
  d.insertParagraph(0, end);
  d.insertText(0, end, 0, '※ 합성 양식입니다.');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, d.exportHwpx());
  console.log(`양식 생성: ${out}`);
  d.free();
}

const root = (p: string) => fileURLToPath(new URL(`../../../templates/${p}`, import.meta.url));

make(
  '클래스 명세서',
  [
    kvTable(['클래스명', '패키지', '설명']),
    listTable(['속성명', '타입', '가시성', '설명']),
    kvTable(['메서드명', '설명']),
    listTable(['파라미터명', '타입', '설명']),
  ],
  root('class-spec/template.hwpx'),
);

make(
  'DB 명세서',
  [
    kvTable(['테이블명', '설명', '비고']),
    listTable(['컬럼명', '타입', '길이', 'NULL', '설명']),
    listTable(['인덱스명', '컬럼', '유니크']),
  ],
  root('db-spec/template.hwpx'),
);

/** 토큰({{이름}})·표식 문단만 있는 보고서 양식 (text·paragraphs 시험용) */
function makeReport(out: string) {
  const d: Doc = createBlankDoc();
  d.insertText(0, 0, 0, '보고서');
  for (const t of ['작성자: {{작성자}}', '작성일: {{작성일}}', '{{요약}}', '※ 합성 양식입니다.']) {
    const p = d.getParagraphCount(0);
    d.insertParagraph(0, p);
    d.insertText(0, p, 0, t);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, d.exportHwpx());
  console.log(`양식 생성: ${out}`);
  d.free();
}
makeReport(root('report/template.hwpx'));
