import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type ConvertReport, convertBytes, type DiagramRenderer, ProfileError } from '../convert/convert';
import type { DocumentEngine } from '../engine/types';
import type { Profile } from '../profile/types';
import { renderMermaid } from './mermaid';
import { loadProfileFile } from './profile-file';

export { ProfileError, ValidationError } from '../convert/convert';

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
  /** Mermaid 중간 산출물 폴더 */
  workDir?: string;
}

export type NodeConvertReport = ConvertReport & { out: string };

export async function convert(engine: DocumentEngine, o: ConvertOptions): Promise<NodeConvertReport> {
  const loaded = loadProfileFile(o.profilePath);
  const errors = loaded.issues.filter((i) => i.severity === 'error');
  if (errors.length || !loaded.profile || !loaded.templatePath) throw new ProfileError(errors);
  const work = o.workDir ?? join(dirname(o.outPath), 'work');
  const renderDiagram: DiagramRenderer = async (source, name) => renderMermaid(source, work, name);
  const { bytes, report, previews } = await convertBytes(engine, {
    mdName: o.mdPath,
    mdText: readFileSync(o.mdPath, 'utf8'),
    template: new Uint8Array(readFileSync(loaded.templatePath)),
    profile: loaded.profile,
    dataSchema: loaded.schemaPath ? (JSON.parse(readFileSync(loaded.schemaPath, 'utf8')) as object) : undefined,
    renderDiagram,
    skipDiagrams: o.skipMermaid,
    output: o.output,
    preview: !!o.previewDir,
  });
  mkdirSync(dirname(o.outPath), { recursive: true });
  writeFileSync(o.outPath, bytes);
  if (o.previewDir) {
    mkdirSync(o.previewDir, { recursive: true });
    const dir = o.previewDir;
    for (const [i, svg] of previews.entries()) writeFileSync(join(dir, `page-${i + 1}.svg`), svg);
  }
  return { out: o.outPath, ...report };
}
