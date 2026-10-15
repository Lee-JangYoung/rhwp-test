import type { DocumentSession, TableRef } from '../engine/types';
import type { Locator } from '../profile/types';

/** 본문 표 중 위치 지정에 맞는 것(표 번호 포함). 지원하지 않는 위치 지정은 null. */
export function findTables(s: DocumentSession, loc: Locator): { ref: TableRef; index: number }[] | null {
  const t = loc.table;
  if (!t) return null;
  const tops = s.topTables();
  const out: { ref: TableRef; index: number }[] = [];
  tops.forEach((ref, index) => {
    if (t.index !== undefined) {
      if (index === t.index) out.push({ ref, index });
      return;
    }
    const cells = s.tableCells(ref);
    const ok =
      t.label !== undefined
        ? cells.some((c) => c.col === 0 && c.text.trim() === t.label?.trim())
        : t.headerLabel !== undefined
          ? cells.some((c) => c.row === 0 && c.text.trim() === t.headerLabel?.trim())
          : t.text !== undefined
            ? cells.some((c) => c.text.includes(t.text as string))
            : false;
    if (ok) out.push({ ref, index });
  });
  return out;
}

export const sameRef = (a: TableRef, b: TableRef) => a.para === b.para && a.ctrl === b.ctrl;
