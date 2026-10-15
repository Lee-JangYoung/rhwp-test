import { type CellInfo, type DocumentSession, type TableRef } from '@yangsik/core';
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

/** 같은 텍스트의 라벨이 둘 이상인 라벨(어느 행을 채울지 정할 수 없어 매핑하면 오류) */
export function duplicateLabels(session: DocumentSession, t: TableRef, o: LabelOptions = {}): Set<string> {
  const labelCol = o.labelColumn ?? 0;
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const c of session.tableCells(t)) {
    if (c.col !== labelCol) continue;
    const label = c.text.trim();
    if (!label) continue;
    if (seen.has(label)) dup.add(label);
    seen.add(label);
  }
  return dup;
}

/** 표 한 개의 "라벨 → 값 텍스트" */
export function readBlock(session: DocumentSession, t: TableRef, o: LabelOptions = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [label, cell] of labelCells(session, t, o)) out[label] = cell.text;
  return out;
}
