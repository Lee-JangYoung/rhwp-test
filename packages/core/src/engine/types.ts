// 엔진 중립 최소 인터페이스 (_spec/02-architecture/engine-interface.md 기준, PoC용 축소판)

export type PageBreakMode = 'none' | 'table' | 'cell';

export interface TableRef {
  /** 표가 속한 본문 문단 번호 (구역 0 기준) */
  para: number;
  /** 문단 안 컨트롤 번호 */
  ctrl: number;
}

export interface CellInfo {
  idx: number;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
}

export interface TemplateAnalysis {
  pages: number;
  /** 구역 수. PoC는 구역 0만 다루므로 2 이상이면 미지원 */
  sections: number;
  styles: number;
  fonts: string[];
  fields: { name: string; value: string }[];
  tables: { ref: TableRef; rows: number; cols: number; cells: number; mergedCells: number }[];
  controlCounts: Record<string, number>;
}

export interface ImageInput {
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  alt?: string;
}

export interface DocumentSession {
  analyze(): TemplateAnalysis;
  setField(name: string, value: string): boolean;
  getField(name: string): string | null;
  /** 본문(list 0)에 직접 놓인 표 목록 */
  topTables(): TableRef[];
  tableCells(t: TableRef): CellInfo[];
  /** src 표를 복제해 after 표 바로 뒤 새 문단에 붙인다 */
  cloneTableAfter(src: TableRef, after: TableRef): TableRef;
  /** 셀 내용을 통째로 교체한다. '\n'은 셀 안 문단 나눔 */
  setCellText(t: TableRef, cellIdx: number, text: string): void;
  /** 표 바로 뒤 새 문단에 그림을 넣는다 */
  insertImageAfter(t: TableRef, img: ImageInput): void;
  /** 표의 쪽 경계 나눔 설정. none=나누지 않음, table=나눔, cell=셀 단위로 나눔 (HWPX pageBreak NONE/TABLE/CELL) */
  setTablePageBreak(t: TableRef, mode: PageBreakMode): void;
  tableLayouts(): {
    pageBreak: PageBreakMode;
    treatAsChar: boolean;
    storedHeightHu: number;
    renderedHeightHu: number | null;
  }[];
  /**
   * 셀 높이를 렌더링된 높이로 맞춰 표의 저장 높이를 갱신한다.
   * 내용을 채운 뒤에도 양식의 원래 높이가 남아 있으면 뒤따르는 문단·그림이 표를 가린다.
   */
  fitTableHeights(): void;
  /** 본문 그림의 배치 속성 (treatAsChar=false면 떠 있는 개체라 표를 덮을 수 있음) */
  pictureLayouts(): { treatAsChar: boolean; width: number; height: number }[];
  controlCounts(): Record<string, number>;
  pageCount(): number;
  /** 본문 텍스트(표 셀 제외) */
  bodyText(): string;
  renderSvg(page: number): string;
  export(): Uint8Array;
  dispose(): void;
}

export interface DocumentEngine {
  id: string;
  version: string;
  /** 양식 바이트로 열기. 없으면 번들 템플릿 기반 빈 문서 */
  open(bytes?: Uint8Array): Promise<DocumentSession>;
}
