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
    /** 앞쪽 셀 몇 개의 내용(행·열 위치와 함께) */
    sample: { row: number; col: number; text: string }[];
  }[];
  warnings: string[];
}

const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

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
        labels: cells.filter((c) => c.col === 0 && c.text.trim()).map((c) => clip(c.text.trim())),
        header: cells.filter((c) => c.row === 0).map((c) => clip(c.text.trim())),
        sample: cells.slice(0, 12).map((c) => ({ row: c.row, col: c.col, text: clip(c.text.trim()) })),
      };
    });
    return {
      pages: a.pages,
      sections: a.sections,
      styles: a.styles,
      fonts: a.fonts,
      fields: a.fields,
      tables,
      warnings,
    };
  } finally {
    s.dispose();
  }
}
