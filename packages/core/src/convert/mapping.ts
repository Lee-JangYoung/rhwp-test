import type { DocumentEngine } from '../engine/types';
import { readMarkdown } from '../markdown/read';
import type { Binding, Locator, Profile, ValueSpec } from '../profile/types';
import { labelCells } from './blocks';
import { findTablesIn } from './resolve';
import { getPath, type Scopes, resolveValue } from './values';

export interface MappingRow {
  label: string;
  value: string;
  found: boolean;
}

export interface MappingPreview {
  templateLabels: string[];
  items: { id: string; rows: MappingRow[] }[];
  unusedLabels: string[];
}

/**
 * 프로필의 repeat → cells 바인딩에 따라 "양식 라벨 ↔ md 값" 대조표를 만든다(변환 전 미리보기).
 * 첫 번째 repeat의 단위 표를 기준으로 한다.
 */
export async function previewMapping(
  engine: DocumentEngine,
  profile: Profile,
  mdText: string,
  template: Uint8Array,
): Promise<MappingPreview> {
  const md = readMarkdown(profile, mdText);
  const s = await engine.open(template);
  try {
    const rep = profile.bindings.find((b) => b.kind === 'repeat');
    const cellsB = ((rep?.do ?? []) as Binding[]).find((b) => b.kind === 'cells');
    if (!rep || !cellsB) return { templateLabels: [], items: [], unusedLabels: [] };
    // 첫 repeat의 단위(표 하나 또는 range의 표들) 안에서, cells의 in(없으면 단위 표)로 표를 정한다
    const all = s.topTables().map((ref, index) => ({ ref, index, item: null }));
    const unitLoc = rep.unit as Locator;
    const unitTables = unitLoc.range
      ? (() => {
          const a = findTablesIn(s, all, unitLoc.range.start)[0];
          const z = findTablesIn(s, all, unitLoc.range.end)[0];
          return a && z ? all.filter((t) => t.index >= a.index && t.index <= z.index) : [];
        })()
      : findTablesIn(s, all, unitLoc);
    const tbl = cellsB.in
      ? findTablesIn(s, unitTables, cellsB.in as Locator)[0]
      : unitTables.length === 1
        ? unitTables[0]
        : undefined;
    const lc = tbl
      ? labelCells(s, tbl.ref, {
          labelColumn: cellsB.labelColumn as number | undefined,
          valueColumn: cellsB.valueColumn as number | undefined,
          value: cellsB.value as 'right' | 'below' | undefined,
        })
      : new Map();
    const labels = [...lc.keys()];
    const used = new Set<string>();
    const arr = (getPath([md.data], String(rep.over)) ?? []) as Record<string, unknown>[];
    const map = (cellsB.map ?? {}) as Record<string, ValueSpec>;
    const items = arr.map((item, n) => {
      const scopes: Scopes = [item, md.data];
      const rows: MappingRow[] = [];
      const push = (label: string, value: string | undefined) => {
        if (value === undefined) return;
        const found = labels.includes(label);
        if (found) used.add(label);
        rows.push({ label, value, found });
      };
      for (const [label, spec] of Object.entries(map)) if (label !== '*') push(label, resolveValue(spec, scopes));
      if ('*' in map) {
        const kv = getPath(scopes, String(map['*'])) as Record<string, string> | undefined;
        for (const [k, v] of Object.entries(kv ?? {})) if (!(k in map)) push(k, v);
      }
      const firstCapture = Object.values(item).find((v) => typeof v === 'string') as string | undefined;
      return { id: firstCapture ?? `#${n + 1}`, rows };
    });
    return { templateLabels: labels, items, unusedLabels: labels.filter((l) => !used.has(l)) };
  } finally {
    s.dispose();
  }
}
