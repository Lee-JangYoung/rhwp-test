// Node용 래퍼: 파일 입출력과 mermaid-cli 연결. 변환 로직은 core.ts(환경 중립)에 있다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { convertBytes, ValidationError, type ConvertReport, type DiagramRenderer } from './core';
import type { DocumentEngine, PageBreakMode } from './engine/types';
import { renderMermaid } from './mermaid';

export { FIELD_MAP, ValidationError } from './core';

export interface ConvertOptions {
  mdPath: string;
  templatePath: string;
  outPath: string;
  schemaPath: string;
  /** Mermaid 렌더와 그림 삽입을 건너뛴다 */
  skipMermaid?: boolean;
  /** 지정하면 쪽별 SVG 미리보기를 이 폴더에 저장한다 */
  previewDir?: string;
  tableSplit?: PageBreakMode;
  fitHeights?: boolean;
  /** Mermaid 중간 산출물 폴더 */
  workDir?: string;
}

export type NodeConvertReport = ConvertReport & { out: string };

export async function convert(engine: DocumentEngine, o: ConvertOptions): Promise<NodeConvertReport> {
  const work = o.workDir ?? join(dirname(o.outPath), 'work');
  const renderDiagram: DiagramRenderer = async (source, name) => renderMermaid(source, work, name);
  const { bytes, report, previews } = await convertBytes(engine, {
    mdName: o.mdPath,
    mdText: readFileSync(o.mdPath, 'utf8'),
    template: new Uint8Array(readFileSync(o.templatePath)),
    schema: JSON.parse(readFileSync(o.schemaPath, 'utf8')) as object,
    renderDiagram: o.skipMermaid ? undefined : renderDiagram,
    tableSplit: o.tableSplit,
    fitHeights: o.fitHeights,
    preview: !!o.previewDir,
  });
  mkdirSync(dirname(o.outPath), { recursive: true });
  writeFileSync(o.outPath, bytes);
  if (o.previewDir) {
    mkdirSync(o.previewDir, { recursive: true });
    previews.forEach((svg, i) => writeFileSync(join(o.previewDir!, `page-${i + 1}.svg`), svg));
  }
  return { out: o.outPath, ...report };
}

