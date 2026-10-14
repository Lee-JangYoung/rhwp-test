// 외부 샘플 양식(로컬 경로)에서 "표 복제 + 셀 채움 + 저장 + 재로드"가 되는지 같은 코드 경로로 확인한다.
// 사용법: tsx scripts/stress.ts <selection.json> <samples-root>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rhwpEngine } from '../src/engine/rhwp';

const [selFile, root] = process.argv.slice(2);
if (!selFile || !root) throw new Error('사용법: stress.ts <selection.json> <samples-root>');
const files = JSON.parse(readFileSync(selFile, 'utf8')) as string[];

interface Row {
  file: string;
  tables: number;
  merged: boolean;
  result: 'ok' | 'skip' | 'fail';
  detail?: string;
}
const rows: Row[] = [];

for (const rel of files) {
  const row: Row = { file: rel.slice(-44), tables: 0, merged: false, result: 'skip' };
  try {
    const s = await rhwpEngine.open(new Uint8Array(readFileSync(join(root, rel))));
    try {
      const a = s.analyze();
      row.tables = a.tables.length;
      if (!a.tables.length) {
        rows.push(row);
        continue;
      }
      if (a.sections > 1) {
        row.detail = `다중 구역(${a.sections}) 미지원`;
        rows.push(row);
        continue;
      }
      row.merged = a.tables[0].mergedCells > 0;
      const src = a.tables[0].ref;
      // 복제 2회 (src → c1 → c2)
      const c1 = s.cloneTableAfter(src, src);
      s.cloneTableAfter(src, c1);
      const live = s.topTables();
      if (live.length !== a.tables.length + 2) throw new Error(`복제 후 표 수 ${live.length} (기대 ${a.tables.length + 2})`);
      const want: { cell: number; text: string }[][] = [];
      for (let k = 0; k < 3; k++) {
        const cells = s.tableCells(live[k]);
        const picks = cells.length > 1 ? [cells[0], cells[1]] : [cells[0]];
        const w = picks.map((c, i) => ({ cell: c.idx, text: i === 0 ? `PoC-${k}` : `줄1-${k}\n줄2-${k}` }));
        w.forEach((x) => s.setCellText(live[k], x.cell, x.text));
        want.push(w);
      }
      const bytes = s.export();
      const r = await rhwpEngine.open(bytes);
      try {
        const t2 = r.topTables();
        if (t2.length !== live.length) throw new Error(`재로드 표 수 ${t2.length} (기대 ${live.length})`);
        want.forEach((w, k) => {
          const cells = r.tableCells(t2[k]);
          w.forEach((x) => {
            const got = cells.find((c) => c.idx === x.cell)?.text;
            if (got !== x.text) throw new Error(`블록 ${k} 셀 ${x.cell}: 기대 ${JSON.stringify(x.text)} / 실제 ${JSON.stringify(got)}`);
          });
        });
      } finally {
        r.dispose();
      }
      row.result = 'ok';
    } finally {
      s.dispose();
    }
  } catch (e) {
    row.result = 'fail';
    row.detail = String((e as Error)?.message ?? e).slice(0, 110);
  }
  rows.push(row);
}

const ok = rows.filter((r) => r.result === 'ok').length;
const fail = rows.filter((r) => r.result === 'fail');
const skip = rows.filter((r) => r.result === 'skip').length;
console.log(`전체 ${rows.length} | 성공 ${ok} | 실패 ${fail.length} | 건너뜀 ${skip} (표 없음 ${rows.filter((r) => r.result === 'skip' && !r.detail).length}, 다중 구역 ${rows.filter((r) => r.detail?.includes('다중 구역')).length})`);
console.log(`병합 셀이 있는 첫 표: ${rows.filter((r) => r.merged).length}개 중 성공 ${rows.filter((r) => r.merged && r.result === 'ok').length}`);
fail.forEach((r) => console.log(`  ✘ ${r.file} (표 ${r.tables}) — ${r.detail}`));
