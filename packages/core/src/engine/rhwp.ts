import { HwpDocument, version as rhwpVersion } from '@rhwp/core';
import type {
  CellInfo,
  PageBreakMode,
  DocumentEngine,
  DocumentSession,
  ImageInput,
  TableRef,
  TemplateAnalysis,
} from './types';

interface Ctrl {
  ctrlId: string;
  list: number;
  para: number;
  controlIndex: number;
  props?: { Height?: number };
}

function check(result: string, what: string): Record<string, unknown> {
  const o = JSON.parse(result) as Record<string, unknown>;
  if (o.ok === false) throw new Error(`${what} 실패: ${result}`);
  return o;
}

// rhwp 값 → HWPX pageBreak: 0=NONE(나누지 않음), 1=TABLE(나눔), 2=CELL(셀 단위로 나눔)
const PAGE_BREAK_CODE: Record<PageBreakMode, number> = { none: 0, table: 1, cell: 2 };
const PAGE_BREAK_NAME: Record<number, PageBreakMode> = { 0: 'none', 1: 'table', 2: 'cell' };

const HWPUNIT_PER_PX = 75; // 7200 HWPUNIT/inch ÷ 96 px/inch
const MAX_IMAGE_WIDTH_HU = 40000; // 본문 폭(약 41,954)보다 조금 작게

export class RhwpSession implements DocumentSession {
  constructor(private readonly doc: HwpDocument) {}

  private controls(): Ctrl[] {
    return JSON.parse(this.doc.getControls()) as Ctrl[];
  }

  topTables(): TableRef[] {
    return this.controls()
      .filter((c) => c.ctrlId === 'tbl' && c.list === 0)
      .map((c) => ({ para: c.para, ctrl: c.controlIndex }));
  }

  controlCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of this.controls()) {
      const k = c.ctrlId.trim() || '(unknown)';
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }

  private dims(t: TableRef): { rowCount: number; colCount: number; cellCount: number } {
    return JSON.parse(this.doc.getTableDimensions(0, t.para, t.ctrl));
  }

  private cellText(t: TableRef, idx: number): string {
    const n = this.doc.getCellParagraphCount(0, t.para, t.ctrl, idx);
    const lines: string[] = [];
    for (let p = 0; p < n; p++) {
      const len = this.doc.getCellParagraphLength(0, t.para, t.ctrl, idx, p);
      lines.push(len > 0 ? this.doc.getTextInCell(0, t.para, t.ctrl, idx, p, 0, len) : '');
    }
    return lines.join('\n');
  }

  tableCells(t: TableRef): CellInfo[] {
    const { cellCount } = this.dims(t);
    const cells: CellInfo[] = [];
    for (let i = 0; i < cellCount; i++) {
      const info = JSON.parse(this.doc.getCellInfo(0, t.para, t.ctrl, i)) as {
        row: number;
        col: number;
        rowSpan: number;
        colSpan: number;
      };
      cells.push({ idx: i, ...info, text: this.cellText(t, i) });
    }
    return cells;
  }

  setCellText(t: TableRef, idx: number, text: string): void {
    const d = this.doc;
    // 1) 셀 안 문단을 하나로 합친다
    let n = d.getCellParagraphCount(0, t.para, t.ctrl, idx);
    while (n > 1) {
      check(d.mergeParagraphInCell(0, t.para, t.ctrl, idx, n - 1), 'mergeParagraphInCell');
      n = d.getCellParagraphCount(0, t.para, t.ctrl, idx);
    }
    // 2) 기존 글을 지운다
    const len = d.getCellParagraphLength(0, t.para, t.ctrl, idx, 0);
    if (len > 0) check(d.deleteTextInCell(0, t.para, t.ctrl, idx, 0, 0, len), 'deleteTextInCell');
    // 3) 줄마다 문단을 나눠 쓴다
    const lines = text.split('\n');
    let p = 0;
    let prevLen = 0;
    lines.forEach((line, i) => {
      if (i > 0) {
        const r = check(d.splitParagraphInCell(0, t.para, t.ctrl, idx, p, prevLen), 'splitParagraphInCell');
        p = r.cellParaIndex as number;
      }
      if (line.length > 0) check(d.insertTextInCell(0, t.para, t.ctrl, idx, p, 0, line), 'insertTextInCell');
      prevLen = line.length;
    });
  }

  replaceText(query: string, text: string): number {
    return (check(this.doc.replaceAll(query, text, true), 'replaceAll').count as number | undefined) ?? 0;
  }

  bodyParagraphs(): string[] {
    const n = this.doc.getParagraphCount(0);
    return Array.from({ length: n }, (_, i) => {
      const len = this.doc.getParagraphLength(0, i);
      return len > 0 ? this.doc.getTextRange(0, i, 0, len) : '';
    });
  }

  findParagraph(query: string): number {
    const r = JSON.parse(this.doc.searchText(query, 0, 0, 0, true, true, false)) as { found: boolean; para?: number };
    return r.found ? (r.para ?? -1) : -1;
  }

  setParagraphLines(para: number, lines: string[]): void {
    const d = this.doc;
    const len = d.getParagraphLength(0, para);
    if (len > 0) check(d.deleteText(0, para, 0, len), 'deleteText');
    let cur = para;
    let prev = 0;
    lines.forEach((line, i) => {
      if (i > 0) {
        cur = check(d.splitParagraph(0, cur, prev), 'splitParagraph').paraIdx as number;
      }
      if (line.length > 0) check(d.insertText(0, cur, 0, line), 'insertText');
      prev = line.length;
    });
  }

  insertRowsAfter(t: TableRef, row: number, count: number): void {
    for (let i = 0; i < count; i++) check(this.doc.insertTableRow(0, t.para, t.ctrl, row, true), 'insertTableRow');
  }

  deleteRow(t: TableRef, row: number): void {
    check(this.doc.deleteTableRow(0, t.para, t.ctrl, row), 'deleteTableRow');
  }

  deleteTable(t: TableRef): void {
    check(this.doc.deleteTableControl(0, t.para, t.ctrl), 'deleteTableControl');
  }

  cloneTableAfter(src: TableRef, after: TableRef): TableRef {
    const d = this.doc;
    check(d.copyControl(0, src.para, '', src.ctrl), 'copyControl');
    check(d.insertParagraph(0, after.para + 1), 'insertParagraph');
    const r = check(d.pasteControl(0, after.para + 1, 0), 'pasteControl');
    return { para: r.paraIdx as number, ctrl: r.controlIdx as number };
  }

  insertImageAfter(t: TableRef, img: ImageInput): void {
    const d = this.doc;
    const naturalHu = img.widthPx * HWPUNIT_PER_PX;
    const width = Math.min(naturalHu, MAX_IMAGE_WIDTH_HU);
    const height = Math.round((width * img.heightPx) / img.widthPx);
    check(d.insertParagraph(0, t.para + 1), 'insertParagraph');
    const ins = check(
      d.insertPictureEx(
        JSON.stringify({
          sectionIdx: 0,
          paraIdx: t.para + 1,
          charOffset: 0,
          width,
          height,
          naturalWidthPx: img.widthPx,
          naturalHeightPx: img.heightPx,
          extension: 'png',
          description: img.alt ?? '',
        }),
        img.bytes,
      ),
      'insertPictureEx',
    );
    // insertPictureEx의 기본값은 "용지 기준으로 떠 있는 개체"(treatAsChar:false, Paper)라 용지 왼쪽 위에 붙어
    // 표를 덮는다. 문단 안에 놓이도록 "글자처럼 취급"으로 바꾼다.
    const idx = [ins.paraIdx as number, ins.controlIdx as number] as const;
    check(d.setPictureProperties(0, idx[0], idx[1], JSON.stringify({ treatAsChar: true })), 'setPictureProperties');
    const p = JSON.parse(d.getPictureProperties(0, idx[0], idx[1])) as { treatAsChar: boolean };
    if (!p.treatAsChar) throw new Error('그림을 글자처럼 취급으로 바꾸지 못했습니다');
  }

  setTablePageBreak(t: TableRef, mode: PageBreakMode): void {
    const v = PAGE_BREAK_CODE[mode];
    check(this.doc.setTableProperties(0, t.para, t.ctrl, JSON.stringify({ pageBreak: v })), 'setTableProperties');
    const back = (JSON.parse(this.doc.getTableProperties(0, t.para, t.ctrl)) as { pageBreak: number }).pageBreak;
    if (back !== v) throw new Error(`표 쪽 나눔 설정 실패: 기대 ${v} / 실제 ${back}`);
  }

  tableLayouts(): {
    pageBreak: PageBreakMode;
    treatAsChar: boolean;
    storedHeightHu: number;
    renderedHeightHu: number | null;
  }[] {
    const stored = new Map(
      this.controls()
        .filter((c) => c.ctrlId === 'tbl' && c.list === 0)
        .map((c) => [`${c.para}:${c.controlIndex}`, c.props?.Height ?? 0]),
    );
    return this.topTables().map((t) => {
      const p = JSON.parse(this.doc.getTableProperties(0, t.para, t.ctrl)) as {
        pageBreak: number;
        treatAsChar: boolean;
      };
      const bb = JSON.parse(this.doc.getTableBBox(0, t.para, t.ctrl)) as { height: number };
      return {
        pageBreak: PAGE_BREAK_NAME[p.pageBreak] ?? 'none',
        treatAsChar: p.treatAsChar,
        storedHeightHu: stored.get(`${t.para}:${t.ctrl}`) ?? 0,
        renderedHeightHu: Math.round(bb.height * HWPUNIT_PER_PX),
      };
    });
  }

  fitTableHeights(): void {
    const d = this.doc;
    const pages = d.pageCount();
    for (const t of this.topTables()) {
      // 쪽을 넘는 표는 셀이 쪽마다 조각나므로 조각 높이를 합산한다
      const px = new Map<number, number>();
      const single = new Set<number>();
      for (let p = 0; p < pages; p++) {
        const boxes = JSON.parse(d.getTableCellBboxes(0, t.para, t.ctrl, p)) as {
          cellIdx: number;
          rowSpan: number;
          pageIndex: number;
          h: number;
        }[];
        for (const b of boxes) {
          if (b.pageIndex !== p) continue;
          px.set(b.cellIdx, (px.get(b.cellIdx) ?? 0) + b.h);
          if (b.rowSpan === 1) single.add(b.cellIdx);
        }
      }
      for (const [idx, h] of px) {
        if (!single.has(idx)) continue; // 행 병합 셀은 건드리지 않는다
        check(
          d.setCellProperties(0, t.para, t.ctrl, idx, JSON.stringify({ height: Math.round(h * HWPUNIT_PER_PX) })),
          'setCellProperties',
        );
      }
    }
  }

  pictureLayouts(): { treatAsChar: boolean; width: number; height: number }[] {
    return this.controls()
      .filter((c) => c.ctrlId === 'gso' && c.list === 0)
      .map((c) => {
        const p = JSON.parse(this.doc.getPictureProperties(0, c.para, c.controlIndex)) as {
          treatAsChar: boolean;
          width: number;
          height: number;
        };
        return { treatAsChar: p.treatAsChar, width: p.width, height: p.height };
      });
  }

  setField(name: string, value: string): boolean {
    const r = JSON.parse(this.doc.setFieldValueByName(name, value)) as { ok?: boolean };
    return r.ok === true;
  }

  getField(name: string): string | null {
    const r = JSON.parse(this.doc.getFieldValueByName(name)) as { ok?: boolean; value?: string };
    return r.ok ? (r.value ?? '') : null;
  }

  pageCount(): number {
    return this.doc.pageCount();
  }

  bodyText(): string {
    let s = '';
    for (let p = 0; p < this.doc.pageCount(); p++) s += this.doc.getPageText(p);
    return s;
  }

  renderSvg(page: number): string {
    return this.doc.renderPageSvg(page);
  }

  export(): Uint8Array {
    return this.doc.exportHwpx();
  }

  analyze(): TemplateAnalysis {
    const info = JSON.parse(this.doc.getDocumentInfo()) as { fontsUsed?: string[] };
    // 구역 1 이후의 표는 문단 번호가 구역 기준이라 구역 0으로 해석하면 실패한다(PoC는 구역 0만 지원). 해석 가능한 표만 담는다.
    const tables: TemplateAnalysis['tables'] = [];
    for (const ref of this.topTables()) {
      try {
        const d = this.dims(ref);
        tables.push({
          ref,
          rows: d.rowCount,
          cols: d.colCount,
          cells: d.cellCount,
          mergedCells: Math.max(0, d.rowCount * d.colCount - d.cellCount),
        });
      } catch {
        // 다중 구역 문서의 다른 구역 표
      }
    }
    const fields = (JSON.parse(this.doc.getFieldList()) as { name: string; value: string }[]).map((f) => ({
      name: f.name,
      value: f.value,
    }));
    return {
      pages: this.doc.pageCount(),
      sections: this.doc.getSectionCount(),
      styles: (JSON.parse(this.doc.getStyleList()) as unknown[]).length,
      fonts: info.fontsUsed ?? [],
      fields,
      tables,
      controlCounts: this.controlCounts(),
    };
  }

  dispose(): void {
    this.doc.free();
  }
}

/**
 * rhwp 엔진을 만든다. `init`은 WASM을 한 번 초기화하는 환경별 함수다(Node: initSync, 브라우저: init).
 * 이 파일은 Node·브라우저 API를 쓰지 않는다.
 */
export function createRhwpEngine(init: () => void | Promise<void>): DocumentEngine {
  let ready: Promise<void> | null = null;
  const engine: { id: string; version: string; open: DocumentEngine['open'] } = {
    id: 'rhwp',
    version: '',
    async open(bytes?: Uint8Array): Promise<DocumentSession> {
      ready ??= Promise.resolve(init());
      await ready;
      engine.version = rhwpVersion();
      if (bytes) return new RhwpSession(new HwpDocument(bytes));
      const d = HwpDocument.createEmpty();
      d.createBlankDocument(); // 번들 템플릿(스타일·구역 정의 포함)
      return new RhwpSession(d);
    },
  };
  return engine;
}
