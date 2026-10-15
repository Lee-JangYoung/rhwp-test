// 합성 양식(우리가 직접 만든 유스케이스 명세서 양식)을 생성한다. 저작권 문제가 없는 PoC용 샘플.
// 실제 한컴 양식과는 다를 수 있으므로 외부 샘플로 교차 확인이 필요하다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createBlankDoc } from '../src/node/index';

const out = process.argv[2] ?? fileURLToPath(new URL('../../../templates/usecase/template.hwpx', import.meta.url));
const LABELS = ['UC ID', '유스케이스명', '액터', '사전조건', '사후조건', '기본 흐름', '대안 흐름'];
const FIELDS = ['문서명', '버전', '작성자', '작성일'];

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
