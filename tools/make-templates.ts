// 합성 양식(유스케이스, 클래스 명세서, DB 명세서, 보고서)을 생성한다. 우리가 직접 만든 샘플이라 저작권 문제가 없다.
// 실제 SI 양식과는 다를 수 있다. 여러 표가 한 문서에 있으므로 표는 "글자처럼 취급"(문단 안)으로 만든다.
//   pnpm gen:templates                    클래스·DB·보고서 양식을 templates/ 에 쓴다
//   tsx tools/make-templates.ts <경로>   유스케이스 양식만 그 경로에 쓴다(TABLE_INLINE=1이면 표를 글자처럼 취급으로, 시험·확인 키트용)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlankDoc } from '@yangsik/engine-rhwp/node';

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

/** 유스케이스 명세서 양식: 라벨 표 1개 (프로필 기본 예제). */
const LABELS = ['UC ID', '유스케이스명', '액터', '사전조건', '사후조건', '기본 흐름', '대안 흐름'];

function makeUsecase(out: string) {
  const d = createBlankDoc();
  d.insertText(0, 0, 0, '유스케이스 명세서');

  for (const f of FIELDS) {
    const p = d.getParagraphCount(0);
    d.insertParagraph(0, p);
    d.insertText(0, p, 0, `${f}: `);
    d.insertClickHereField(0, p, f.length + 2, `${f} 입력`, '', f, true);
  }

  const blank = d.getParagraphCount(0);
  d.insertParagraph(0, blank);
  const tp = d.getParagraphCount(0);
  d.insertParagraph(0, tp);
  const r = JSON.parse(d.createTable(0, tp, 0, LABELS.length, 2)) as { paraIdx: number; controlIdx: number };
  // 표 배치: 기본은 떠 있는 표(글자처럼 취급 아님). rhwp 조판은 "글자처럼 취급"인 표를 쪽 경계에서 나누지 않아
  // 긴 표가 쪽 아래로 넘친다. 쪽을 넘어 이어지게 하려면 떠 있는 표여야 한다. TABLE_INLINE=1이면 글자처럼 취급으로 만든다.
  if (process.env.TABLE_INLINE === '1')
    d.setTableProperties(0, r.paraIdx, r.controlIdx, JSON.stringify({ treatAsChar: true }));
  LABELS.forEach((label, row) => {
    d.insertTextInCell(0, r.paraIdx, r.controlIdx, row * 2, 0, 0, label);
    d.insertTextInCell(0, r.paraIdx, r.controlIdx, row * 2 + 1, 0, 0, '(입력)');
  });

  const end = d.getParagraphCount(0);
  d.insertParagraph(0, end);
  d.insertText(0, end, 0, '※ PoC용 합성 양식입니다.');

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, d.exportHwpx());
  console.log(`양식 생성: ${out}`);
  d.free();
}

const root = (p: string) => fileURLToPath(new URL(`../templates/${p}`, import.meta.url));

const only = process.argv[2];
if (only) {
  makeUsecase(only);
  process.exit(0);
}

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
