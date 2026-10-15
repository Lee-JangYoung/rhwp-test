import type { DocumentEngine } from '../engine/types';

export interface TemplateFacts {
  pages: number;
  sections: number;
  styles: number;
  fonts: string[];
  fields: { name: string; value: string }[];
  tables: {
    index: number;
    rows: number;
    cols: number;
    mergedCells: number;
    /** 0열의 비어 있지 않은 텍스트(라벨 후보) */
    labels: string[];
    /** 첫 행의 텍스트(머리글 후보) */
    header: string[];
    /** 앞쪽 4개 행의 셀 텍스트(열 순서). rows의 머리행 확인용 */
    rowsText: string[][];
    /** 모든 셀의 텍스트(앞 500칸, 각 120자). table.text 위치 지정 확인용이라 LLM 프롬프트에는 넣지 않는다 */
    texts: string[];
    /** 앞쪽 셀 몇 개의 내용(행·열 위치와 함께) */
    sample: { row: number; col: number; text: string }[];
  }[];
  /** 본문 문단의 텍스트(비어 있지 않은 것, 앞 60개). paragraphs 바인딩의 표식 확인용 */
  paragraphs: { index: number; text: string }[];
  /** 본문과 표 셀 안의 치환 토큰 이름({{이름}}) */
  tokens: string[];
  warnings: string[];
}

const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);
/** 라벨·머리글은 프로필에 그대로 쓰므로 거의 자르지 않는다 */
const LABEL_MAX = 300;

/**
 * 양식에서 프로필 작성에 필요한 사실을 JSON으로 뽑는다(LLM·사람의 입력).
 * 프로필에 쓰는 위치·라벨·누름틀은 이 결과에 있는 것만 쓴다.
 */
export async function analyzeTemplate(engine: DocumentEngine, template: Uint8Array): Promise<TemplateFacts> {
  const s = await engine.open(template);
  try {
    const a = s.analyze();
    const warnings: string[] = [];
    if (a.sections > 1) warnings.push(`다중 구역 양식(${a.sections}개)은 지원하지 않습니다(구역 0의 표만 분석)`);
    const tables = a.tables.map((t, index) => {
      const cells = s.tableCells(t.ref);
      return {
        index,
        rows: t.rows,
        cols: t.cols,
        mergedCells: t.mergedCells,
        labels: cells.filter((c) => c.col === 0 && c.text.trim()).map((c) => clip(c.text.trim(), LABEL_MAX)),
        header: cells.filter((c) => c.row === 0).map((c) => clip(c.text.trim(), LABEL_MAX)),
        texts: cells.slice(0, 500).map((c) => clip(c.text.trim(), 120)),
        rowsText: [0, 1, 2, 3].map((r) =>
          cells
            .filter((c) => c.row === r)
            .sort((a, z) => a.col - z.col)
            .map((c) => clip(c.text.trim(), LABEL_MAX)),
        ),
        sample: cells.slice(0, 12).map((c) => ({ row: c.row, col: c.col, text: clip(c.text.trim()) })),
      };
    });
    const tokens = new Set<string>();
    const scan = (text: string) => {
      for (const m of text.matchAll(/\{\{([^{}]+)\}\}/g)) tokens.add(m[1].trim());
    };
    const paragraphs = s
      .bodyParagraphs()
      .map((text, index) => ({ index, text: text.trim() }))
      .filter((p) => p.text);
    for (const p of paragraphs) scan(p.text);
    for (const t of a.tables) for (const c of s.tableCells(t.ref)) scan(c.text);
    return {
      pages: a.pages,
      sections: a.sections,
      styles: a.styles,
      fonts: a.fonts,
      fields: a.fields,
      tables,
      paragraphs: paragraphs.slice(0, 60).map((p) => ({ index: p.index, text: clip(p.text, 80) })),
      tokens: [...tokens],
      warnings,
    };
  } finally {
    s.dispose();
  }
}
