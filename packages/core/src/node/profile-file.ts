import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type Issue, parseProfile, type Profile } from '../index';

export interface LoadedProfile {
  profile?: Profile;
  issues: Issue[];
  lineOf?: (path: string) => number | undefined;
  /** 프로필이 있는 폴더 */
  dir: string;
  /** 프로필 폴더 기준으로 해석한 절대 경로 */
  templatePath?: string;
  schemaPath?: string;
}

/** 프로필 파일(YAML)을 읽는다. template·schema는 프로필 폴더 기준 상대 경로로 해석하고 존재를 확인한다. */
export function loadProfileFile(file: string): LoadedProfile {
  const dir = dirname(resolve(file));
  const r = parseProfile(readFileSync(file, 'utf8'));
  const out: LoadedProfile = { ...r, dir };
  if (!r.profile) return out;
  const check = (key: 'template' | 'schema', value: string | undefined): string | undefined => {
    if (!value) return undefined;
    const abs = resolve(dir, value);
    if (!existsSync(abs))
      out.issues.push({
        code: 'file-not-found',
        severity: 'error',
        path: key,
        line: r.lineOf?.(key),
        message: `파일이 없음: ${value}`,
        actual: value,
      });
    return abs;
  };
  out.templatePath = check('template', r.profile.template);
  out.schemaPath = check('schema', r.profile.schema);
  return out;
}
