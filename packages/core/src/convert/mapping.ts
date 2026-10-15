import { parseMarkdown } from '../markdown/parse';
import type { DocumentEngine } from '../engine/types';
import { labelCells } from './blocks';
import { blockValues } from './convert';

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

/** 양식의 라벨과 md 값을 대조한다 (첫 번째 표 기준, 변환 전 미리보기). */
export async function previewMapping(
  engine: DocumentEngine,
  mdText: string,
  template: Uint8Array,
): Promise<MappingPreview> {
  const ir = parseMarkdown(mdText);
  const s = await engine.open(template);
  try {
    const proto = s.analyze().tables[0]?.ref;
    const labels = proto ? [...labelCells(s, proto).keys()] : [];
    const used = new Set<string>();
    const items = ir.items.map((item) => ({
      id: item.id,
      rows: Object.entries(blockValues(item)).map(([label, value]) => {
        const found = labels.includes(label);
        if (found) used.add(label);
        return { label, value, found };
      }),
    }));
    return { templateLabels: labels, items, unusedLabels: labels.filter((l) => !used.has(l)) };
  } finally {
    s.dispose();
  }
}
