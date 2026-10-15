import type { CellInfo, DocumentSession, TableRef } from '../engine/types';

/**
 * 표에서 "라벨 → 값 셀"을 찾는다. 규칙: 0열 셀 텍스트가 라벨, 같은 행의 1열 셀이 값.
 * (python-hwpx의 라벨 기반 셀 찾기와 같은 방식)
 */
export function labelCells(session: DocumentSession, t: TableRef): Map<string, CellInfo> {
  const cells = session.tableCells(t);
  const out = new Map<string, CellInfo>();
  for (const c of cells) {
    if (c.col !== 0) continue;
    const label = c.text.trim();
    if (!label) continue;
    const value = cells.find((v) => v.row === c.row && v.col === 1);
    if (value) out.set(label, value);
  }
  return out;
}

/** 표 한 개의 "라벨 → 값 텍스트" */
export function readBlock(session: DocumentSession, t: TableRef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [label, cell] of labelCells(session, t)) out[label] = cell.text;
  return out;
}
