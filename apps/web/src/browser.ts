// 브라우저 환경 연결: rhwp WASM 초기화, Mermaid → PNG 렌더, 사용자 글꼴 등록.
import init from '@rhwp/core';
import wasmUrl from '@rhwp/core/rhwp_bg.wasm?url';
import mermaid from 'mermaid';
import type { DiagramRenderer } from '@yangsik/core';
import { createRhwpEngine } from '@yangsik/engine-rhwp';

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

/** 사용자가 올린 글꼴 (브라우저 메모리에만 둔다. 서버·저장소로 보내지 않는다) */
export interface UserFont {
  family: string;
  data: Uint8Array;
}
let diagramFont: UserFont | null = null;

/** 글꼴을 페이지에 등록한다(화면 표시용). Mermaid 그림용은 setDiagramFont로 따로 지정한다. */
export async function registerFont(f: UserFont): Promise<void> {
  const face = new FontFace(f.family, f.data.slice().buffer);
  await face.load();
  document.fonts.add(face);
}

/** Mermaid 그림에 쓸 글꼴. SVG를 이미지로 그릴 때는 페이지 글꼴이 보이지 않아 글꼴 데이터를 SVG에 직접 넣는다. */
export function setDiagramFont(f: UserFont | null): void {
  diagramFont = f;
  mermaidReady = false;
}

const toBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Mermaid → SVG → canvas → PNG. htmlLabels를 꺼서 <foreignObject> 없이 캔버스에 그려지게 한다. */
export const renderDiagram: DiagramRenderer = async (source, name) => {
  if (!mermaidReady) {
    mermaid.initialize({
      startOnLoad: false,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      securityLevel: 'strict',
      ...(diagramFont
        ? {
            fontFamily: `'${diagramFont.family}'`,
            themeVariables: { fontFamily: `'${diagramFont.family}'` },
            // 시퀀스 다이어그램은 글꼴을 별도 옵션으로 가진다
            sequence: {
              actorFontFamily: `'${diagramFont.family}'`,
              messageFontFamily: `'${diagramFont.family}'`,
              noteFontFamily: `'${diagramFont.family}'`,
            },
          }
        : {}),
    });
    mermaidReady = true;
  }
  const t0 = performance.now();
  const { svg } = await mermaid.render(`m-${name.replace(/\W/g, '')}-${Math.round(t0)}`, source);
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const vb = doc.getAttribute('viewBox')?.split(/\s+/).map(Number);
  const w = Math.ceil(vb?.[2] ?? 800);
  const h = Math.ceil(vb?.[3] ?? 600);
  if (diagramFont) {
    const st = doc.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = `@font-face{font-family:'${diagramFont.family}';src:url('data:font/ttf;base64,${toBase64(diagramFont.data)}')}`;
    doc.insertBefore(st, doc.firstChild);
  }
  doc.setAttribute('width', String(w));
  doc.setAttribute('height', String(h));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // SVG 안의 data: 글꼴은 이미지 디코딩과 별개로 비동기 로드된다. 잠시 기다린 뒤 그린다.
    if (diagramFont) await new Promise((r) => setTimeout(r, 300));
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob: Blob = await new Promise((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error('PNG 변환 실패'))), 'image/png'),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (import.meta.env.DEV)
      (window as unknown as { __lastDiagram?: number[] }).__lastDiagram = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      ]; // 시험용
    return { bytes, widthPx: c.width, heightPx: c.height, ms: Math.round(performance.now() - t0) };
  } finally {
    URL.revokeObjectURL(url);
  }
};
