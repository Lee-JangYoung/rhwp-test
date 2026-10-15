import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type ConvertReport, convertBytes, type DiagramRenderer, type OutputFormat, ProfileError } from './convert';
import { type DocumentEngine, type Profile } from '@yangsik/core';
import { loadProfileFile } from '@yangsik/core/node';
import { renderMermaid } from '@yangsik/diagram/node';

export { ProfileError, ValidationError } from './convert';

export interface ConvertOptions {
  mdPath: string;
  /** 프로필 파일(YAML). 양식·md 규약은 프로필 폴더 기준으로 읽는다 */
  profilePath: string;
  outPath: string;
  /** 다이어그램 렌더와 그림 삽입을 건너뛴다 */
  skipMermaid?: boolean;
  /** 지정하면 쪽별 SVG 미리보기를 이 폴더에 저장한다 */
  previewDir?: string;
  /** 프로필의 output을 덮어쓴다 */
  output?: Partial<Omit<Profile['output'], 'diagram'>>;
  /** 만들 형식. 기본 ['hwpx']. 'hwp'를 주면 outPath의 확장자만 .hwp로 바꾼 파일도 저장한다(자체 검증을 통과한 경우만) */
  formats?: OutputFormat[];
  /** Mermaid 중간 산출물 폴더. 생략하면 이 호출만의 임시 폴더를 만들고 끝나면 지운다(동시 실행이 섞이지 않게) */
  workDir?: string;
}

export type NodeConvertReport = ConvertReport & { out: string; outHwp?: string };

export const hwpPathOf = (hwpxPath: string): string => hwpxPath.replace(/\.hwpx$/i, '') + '.hwp';

export async function convert(engine: DocumentEngine, o: ConvertOptions): Promise<NodeConvertReport> {
  const loaded = loadProfileFile(o.profilePath);
  const errors = loaded.issues.filter((i) => i.severity === 'error');
  if (errors.length || !loaded.profile || !loaded.templatePath) throw new ProfileError(errors);
  const ownWork = o.workDir === undefined;
  const work = o.workDir ?? mkdtempSync(join(tmpdir(), 'yangsik-work-'));
  const renderDiagram: DiagramRenderer = async (source, name) => renderMermaid(source, work, name);
  try {
    return await convertFile(engine, o, loaded, renderDiagram);
  } finally {
    if (ownWork) rmSync(work, { recursive: true, force: true });
  }
}

async function convertFile(
  engine: DocumentEngine,
  o: ConvertOptions,
  loaded: ReturnType<typeof loadProfileFile>,
  renderDiagram: DiagramRenderer,
): Promise<NodeConvertReport> {
  const { bytes, hwp, report, previews } = await convertBytes(engine, {
    mdName: o.mdPath,
    mdText: readFileSync(o.mdPath, 'utf8'),
    template: new Uint8Array(readFileSync(loaded.templatePath as string)),
    profile: loaded.profile as Profile,
    dataSchema: loaded.schemaPath ? (JSON.parse(readFileSync(loaded.schemaPath, 'utf8')) as object) : undefined,
    renderDiagram,
    skipDiagrams: o.skipMermaid,
    output: o.output,
    preview: !!o.previewDir,
    formats: o.formats,
  });
  mkdirSync(dirname(o.outPath), { recursive: true });
  writeFileSync(o.outPath, bytes);
  // 검증을 통과하지 못한 HWP는 쓰지 않는다 (HWPX는 이미 저장됨)
  let outHwp: string | undefined;
  if (hwp && report.hwp?.ok) {
    outHwp = hwpPathOf(o.outPath);
    writeFileSync(outHwp, hwp);
  }
  if (o.previewDir) {
    mkdirSync(o.previewDir, { recursive: true });
    const dir = o.previewDir;
    for (const [i, svg] of previews.entries()) writeFileSync(join(dir, `page-${i + 1}.svg`), svg);
  }
  return { out: o.outPath, ...(outHwp ? { outHwp } : {}), ...report };
}
