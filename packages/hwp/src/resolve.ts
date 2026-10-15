import { type DocumentSession, type Locator, type TableRef } from '@yangsik/core';
type Cand<T> = { ref: TableRef; index: number; item: T };

/**
 * 후보 표들(문맥 안에서 문서 순서) 중 위치 지정에 맞는 것. index는 후보 안에서의 순번(0부터).
 * 지원하지 않는 위치 지정(table 외)은 빈 목록.
 */
export function findTablesIn<T>(s: DocumentSession, cand: Cand<T>[], loc: Locator): Cand<T>[] {
  const t = loc.table;
  if (!t) return [];
  return cand.filter(({ ref, index }) => {
    if (t.index !== undefined) return index === t.index;
    const cells = s.tableCells(ref);
    return t.label !== undefined
      ? cells.some((c) => c.col === 0 && c.text.trim() === t.label?.trim())
      : t.headerLabel !== undefined
        ? cells.some((c) => c.row === 0 && c.text.trim() === t.headerLabel?.trim())
        : t.text !== undefined
          ? cells.some((c) => c.text.includes(t.text as string))
          : false;
  });
}
