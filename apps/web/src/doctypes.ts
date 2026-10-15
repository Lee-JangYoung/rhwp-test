// 저장소의 문서 유형(templates/<유형>/)을 빌드 때 묶어 둔다. 사용자가 양식·프로필을 올려 바꿀 수도 있다.
import { type Profile, parseProfile } from '@yangsik/core';

const profileTexts = import.meta.glob('../../../templates/*/profile.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const examples = import.meta.glob('../../../templates/*/example.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const schemas = import.meta.glob('../../../templates/*/schema.json', { import: 'default', eager: true }) as Record<
  string,
  object
>;
const templates = import.meta.glob('../../../templates/*/template.hwpx', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface Doctype {
  id: string;
  profile: Profile;
  profileText: string;
  example: string;
  schema?: object;
  templateUrl: string;
}

const idOf = (path: string) => /templates\/([^/]+)\//.exec(path)?.[1] ?? '';
const byId = <T>(m: Record<string, T>) => new Map(Object.entries(m).map(([k, v]) => [idOf(k), v]));

export const DOCTYPES: Doctype[] = (() => {
  const ex = byId(examples);
  const sc = byId(schemas);
  const tp = byId(templates);
  const out: Doctype[] = [];
  for (const [path, text] of Object.entries(profileTexts)) {
    const id = idOf(path);
    const parsed = parseProfile(text);
    const templateUrl = tp.get(id);
    if (!parsed.profile || !templateUrl) continue;
    out.push({
      id,
      profile: parsed.profile,
      profileText: text,
      example: ex.get(id) ?? '',
      schema: sc.get(id),
      templateUrl,
    });
  }
  // 유스케이스를 먼저 둔다
  return out.sort((a, z) => (a.id === 'usecase' ? -1 : z.id === 'usecase' ? 1 : a.id.localeCompare(z.id)));
})();

/** 빌드 때 data: URL로 내장된 양식(작은 파일)은 fetch 없이 해독한다(Artifact 같은 제한 환경) */
export async function loadTemplateBytes(url: string): Promise<Uint8Array> {
  const m = /^data:[^,]*;base64,(.*)$/.exec(url);
  if (m) return Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}
