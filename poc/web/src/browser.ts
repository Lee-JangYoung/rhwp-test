// 브라우저 환경 연결: rhwp WASM 초기화, Mermaid → PNG 렌더, 매핑 미리보기.
import init from '@rhwp/core';
import wasmUrl from '@rhwp/core/rhwp_bg.wasm?url';
import mermaid from 'mermaid';
import { labelCells } from '../../src/blocks';
import { blockValues, type DiagramRenderer } from '../../src/core';
import { createRhwpEngine } from '../../src/engine/rhwp';
import { parseMarkdown } from '../../src/parse';

export const engine = createRhwpEngine(async () => {
  const g = globalThis as Record<string, unknown>;
  const ctx = document.createElement('canvas').getContext('2d')!;
  // README가 요구하는 폭 측정 함수 (호출 여부는 S-11로 확인 중)
  g.measureTextWidth ??= (font: string, text: string) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
  await init({ module_or_path: wasmUrl });
});

let mermaidReady = false;

/** Mermaid → SVG → canvas → PNG. htmlLabels를 꺼서 <foreignObject> 없이 캔버스에 그려지게 한다. */
export const renderDiagram: DiagramRenderer = async (source, name) => {
  if (!mermaidReady) {
    mermaid.initialize({ startOnLoad: false, htmlLabels: false, flowchart: { htmlLabels: false }, securityLevel: 'strict' });
    mermaidReady = true;
  }
  const t0 = performance.now();
  const { svg } = await mermaid.render(`m-${name.replace(/\W/g, '')}-${Math.round(t0)}`, source);
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const vb = doc.getAttribute('viewBox')?.split(/\s+/).map(Number);
  const w = Math.ceil(vb?.[2] ?? 800);
  const h = Math.ceil(vb?.[3] ?? 600);
  doc.setAttribute('width', String(w));
  doc.setAttribute('height', String(h));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG 변환 실패'))), 'image/png'));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), widthPx: c.width, heightPx: c.height, ms: Math.round(performance.now() - t0) };
  } finally {
    URL.revokeObjectURL(url);
  }
};

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
export async function previewMapping(mdText: string, template: Uint8Array): Promise<MappingPreview> {
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
