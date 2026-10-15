import type { CellInfo, DocumentSession, TableRef } from '../engine/types';

export interface LabelOptions {
  /** 라벨이 있는 열(기본 0) */
  labelColumn?: number;
  /** 값 셀이 있는 열(기본 1). value가 right일 때 */
  valueColumn?: number;
  /** 값 셀 위치: 라벨의 오른쪽(기본) 또는 아래 */
  value?: 'right' | 'below';
}

/**
 * 표에서 "라벨 → 값 셀"을 찾는다. 기본 규칙: 0열 셀 텍스트가 라벨, 같은 행의 1열이 값 셀.
 * value가 below면 라벨 셀 바로 아래 칸(같은 열)이 값 셀이다.
 */
export function labelCells(session: DocumentSession, t: TableRef, o: LabelOptions = {}): Map<string, CellInfo> {
  const cells = session.tableCells(t);
  const labelCol = o.labelColumn ?? 0;
  const valueCol = o.valueColumn ?? 1;
  const out = new Map<string, CellInfo>();
  for (const c of cells) {
    if (c.col !== labelCol) continue;
    const label = c.text.trim();
    if (!label) continue;
    const value =
      o.value === 'below'
        ? cells.find((v) => v.row === c.row + c.rowSpan && v.col === labelCol)
        : cells.find((v) => v.row === c.row && v.col === valueCol);
    if (value) out.set(label, value);
  }
  return out;
}

/** 표 한 개의 "라벨 → 값 텍스트" */
export function readBlock(session: DocumentSession, t: TableRef, o: LabelOptions = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [label, cell] of labelCells(session, t, o)) out[label] = cell.text;
  return out;
}
