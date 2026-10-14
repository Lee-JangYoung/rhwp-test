import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { labelCells } from './blocks';
import type { DocumentEngine, PageBreakMode, TableRef } from './engine/types';
import { renderMermaid, type RenderedDiagram } from './mermaid';
import { parseMarkdown, type Ir } from './parse';
import { formatViolations, validateIr, type Violation } from './validate';
import { verifyOutput, type Expected, type VerifyReport } from './verify';

/** front-matter 키 → 양식 누름틀 이름 */
export const FIELD_MAP: Record<string, string> = { title: '문서명', version: '버전', author: '작성자', date: '작성일' };

export class ValidationError extends Error {
  constructor(
    public violations: Violation[],
    file: string,
  ) {
    super(`규약 위반 ${violations.length}건\n${formatViolations(file, violations)}`);
  }
}

export interface ConvertOptions {
  mdPath: string;
  templatePath: string;
  outPath: string;
  schemaPath: string;
  /** Mermaid 렌더와 그림 삽입을 건너뛴다 */
  skipMermaid?: boolean;
  /** 지정하면 쪽별 SVG 미리보기를 이 폴더에 저장한다 */
  previewDir?: string;
  /** 반복 블록 표의 쪽 경계 설정 (기본 cell = 셀 단위로 나눔, 한컴 샘플에서 가장 흔한 값) */
  tableSplit?: PageBreakMode;
  /** false면 표 높이 맞춤을 건너뛴다 (자체 검증이 낡은 높이를 잡는지 시험할 때만 사용) */
  fitHeights?: boolean;
  /** Mermaid 중간 산출물 폴더 */
  workDir?: string;
}

export interface ConvertReport {
  out: string;
  items: number;
  fieldsSet: Record<string, boolean>;
  cloned: number;
  cellsSet: number;
  imagesInserted: number;
  diagrams: { name: string; ms: number; widthPx: number; heightPx: number }[];
  warnings: string[];
  pages: number;
  verify: VerifyReport;
  timingsMs: Record<string, number>;
}

const numbered = (lines: string[]) => lines.map((s, i) => `${i + 1}. ${s}`).join('\n');

export async function convert(engine: DocumentEngine, o: ConvertOptions): Promise<ConvertReport> {
  const timings: Record<string, number> = {};
  const lap = (k: string, t0: number) => (timings[k] = Date.now() - t0);
  const warnings: string[] = [];

  // 1) 파싱·검증 (P1)
  let t0 = Date.now();
  const ir: Ir = parseMarkdown(readFileSync(o.mdPath, 'utf8'));
  ir.warnings.forEach((w) => warnings.push(`${o.mdPath}:${w.line} ${w.message}`));
  const violations = validateIr(ir, o.schemaPath);
  lap('parse+validate', t0);
  if (violations.length) throw new ValidationError(violations, o.mdPath);

  // 2) 양식 열기 (P2)
  t0 = Date.now();
  const s = await engine.open(new Uint8Array(readFileSync(o.templatePath)));
  lap('open', t0);
  try {
    const analysis = s.analyze();
    if (analysis.sections > 1) throw new Error(`다중 구역 양식(${analysis.sections}개)은 PoC에서 지원하지 않습니다`);
    const protos = analysis.tables.map((t) => t.ref);
    if (protos.length === 0) throw new Error('양식에 반복 블록으로 쓸 표가 없습니다');
    const proto = protos[0];

    const fieldsSet: Record<string, boolean> = {};
    const expectedFields: Record<string, string> = {};
    for (const [key, name] of Object.entries(FIELD_MAP)) {
      const value = String(ir.meta[key] ?? '');
      fieldsSet[name] = s.setField(name, value);
      if (fieldsSet[name]) expectedFields[name] = value;
      else warnings.push(`양식에 누름틀 "${name}"이(가) 없어 건너뜀`);
    }

    // 3) 반복 블록: 표 단위 복제 (P3)
    t0 = Date.now();
    const blocks: TableRef[] = [proto];
    for (let i = 1; i < ir.items.length; i++) blocks.push(s.cloneTableAfter(proto, blocks[i - 1]));
    lap('clone', t0);

    // 복제 후 문단 번호가 밀릴 수 있으니 표 목록을 다시 읽는다
    const live = s.topTables();
    if (live.length !== ir.items.length) throw new Error(`표 수 불일치: 기대 ${ir.items.length} / 실제 ${live.length}`);

    // 4) 복제본별 값 채움 (P3)
    t0 = Date.now();
    let cellsSet = 0;
    const expectedBlocks: Record<string, string>[] = [];
    ir.items.forEach((item, i) => {
      const map = labelCells(s, live[i]);
      const values: Record<string, string> = {
        'UC ID': item.id,
        유스케이스명: item.name,
        ...item.fields,
        '기본 흐름': numbered(item.flows.main),
        ...(item.flows.alt.length ? { '대안 흐름': numbered(item.flows.alt) } : {}),
      };
      const want: Record<string, string> = {};
      for (const [label, value] of Object.entries(values)) {
        const cell = map.get(label);
        if (!cell) {
          warnings.push(`${o.mdPath}:${item.line} 양식에 "${label}" 라벨이 없어 건너뜀`);
          continue;
        }
        s.setCellText(live[i], cell.idx, value);
        want[label] = value;
        cellsSet++;
      }
      // 값이 없는 라벨은 양식의 안내 문구를 비운다
      for (const [label, cell] of map) {
        if (!(label in want)) {
          s.setCellText(live[i], cell.idx, '');
          want[label] = '';
        }
      }
      expectedBlocks.push(want);
    });
    const split = o.tableSplit ?? 'cell';
    live.forEach((t) => s.setTablePageBreak(t, split));
    if (o.fitHeights !== false) s.fitTableHeights();
    lap('fill', t0);

    // 5) Mermaid → 그림 (P4). 뒤쪽 블록부터 넣어 앞쪽 문단 번호가 밀리지 않게 한다.
    t0 = Date.now();
    let imagesInserted = 0;
    const diagrams: ConvertReport['diagrams'] = [];
    if (!o.skipMermaid) {
      const work = o.workDir ?? join(o.outPath, '..', 'work');
      const rendered = new Map<string, RenderedDiagram[]>();
      for (const item of ir.items) {
        const list: RenderedDiagram[] = [];
        for (const [k, d] of item.diagrams.entries()) {
          const name = `${item.id}-${k + 1}`;
          const r = await renderMermaid(d.source, work, name);
          diagrams.push({ name, ms: r.ms, widthPx: r.widthPx, heightPx: r.heightPx });
          list.push(r);
        }
        rendered.set(item.id, list);
      }
      for (let i = ir.items.length - 1; i >= 0; i--) {
        const list = rendered.get(ir.items[i].id) ?? [];
        for (let k = list.length - 1; k >= 0; k--) {
          s.insertImageAfter(live[i], { bytes: list[k].bytes, widthPx: list[k].widthPx, heightPx: list[k].heightPx, alt: `${ir.items[i].id} 다이어그램` });
          imagesInserted++;
        }
      }
    }
    lap('mermaid+images', t0);

    // 6) 저장 (P5)
    t0 = Date.now();
    const preCounts = s.controlCounts();
    const bytes = s.export();
    mkdirSync(join(o.outPath, '..'), { recursive: true });
    writeFileSync(o.outPath, bytes);
    lap('export', t0);

    if (o.previewDir) {
      mkdirSync(o.previewDir, { recursive: true });
      for (let p = 0; p < s.pageCount(); p++) writeFileSync(join(o.previewDir, `page-${p + 1}.svg`), s.renderSvg(p));
    }

    // 7) 자체 검증 (P5)
    t0 = Date.now();
    const expected: Expected = { fields: expectedFields, blocks: expectedBlocks, images: imagesInserted, tableSplit: split, preExportCounts: preCounts };
    const verify = await verifyOutput(engine, bytes, expected);
    lap('verify', t0);

    return {
      out: o.outPath,
      items: ir.items.length,
      fieldsSet,
      cloned: ir.items.length - 1,
      cellsSet,
      imagesInserted,
      diagrams,
      warnings,
      pages: s.pageCount(),
      verify,
      timingsMs: timings,
    };
  } finally {
    s.dispose();
  }
}
