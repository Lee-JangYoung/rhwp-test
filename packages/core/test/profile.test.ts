import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildProfileSchema,
  describeKinds,
  getProfileGuide,
  GUIDE_TOPICS,
  ISSUE_CODES,
  parseProfile,
  type Issue,
} from '../src/index';
import { CLASS_SPEC, DB_SPEC, KINDS, MINIMAL_USECASE } from '../src/profile/kinds';
import { loadProfileFile } from '../src/node/index';
import { profileReferenceMarkdown } from '../../../tools/profile-docs';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const USECASE_PROFILE = at('../../../templates/usecase/profile.yaml');

const codes = (issues: Issue[]) => issues.map((i) => i.code);

describe('프로필 로드·스키마', () => {
  it('최소 프로필은 기본값만으로 통과하고 기본값이 채워진다', () => {
    const r = parseProfile(MINIMAL_USECASE);
    expect(r.issues).toEqual([]);
    expect(r.profile?.output).toEqual({
      tablePageBreak: 'cell',
      fitHeights: true,
      diagram: { maxWidthHu: 40000, scale: 2 },
    });
    expect(r.profile?.policy).toEqual({
      onMissingLabel: 'error',
      onMissingField: 'error',
      onMissingRenderer: 'error',
      onUnmappedData: 'warn',
    });
  });

  it('저장소의 클래스·DB 명세서 프로필 파일이 등록부의 예제와 같다 (pnpm gen:profiles)', () => {
    expect(readFileSync(at('../../../templates/class-spec/profile.yaml'), 'utf8')).toBe(CLASS_SPEC);
    expect(readFileSync(at('../../../templates/db-spec/profile.yaml'), 'utf8')).toBe(DB_SPEC);
  });

  it('저장소의 유스케이스 프로필 파일이 가이드의 최소 예와 같고, 파일에서 읽힌다', () => {
    expect(readFileSync(USECASE_PROFILE, 'utf8')).toBe(MINIMAL_USECASE);
    const l = loadProfileFile(USECASE_PROFILE);
    expect(l.issues).toEqual([]);
    expect(l.templatePath?.endsWith('templates/usecase/template.hwpx')).toBe(true);
    expect(l.schemaPath?.endsWith('templates/usecase/schema.json')).toBe(true);
  });

  it('프로필이 가리키는 파일이 없으면 file-not-found', () => {
    const tmp = at('../../../out/test/profile-missing.yaml');
    mkdirSync(at('../../../out/test'), { recursive: true });
    writeFileSync(tmp, MINIMAL_USECASE);
    const l = loadProfileFile(tmp);
    expect(codes(l.issues)).toEqual(['file-not-found', 'file-not-found']);
    expect(l.issues[0].path).toBe('template');
  });

  it('저장된 profile.schema.json이 등록부에서 생성한 결과와 같다 (pnpm gen:schema)', () => {
    const saved = JSON.parse(readFileSync(at('../schema/profile.schema.json'), 'utf8'));
    expect(saved).toEqual(JSON.parse(JSON.stringify(buildProfileSchema())));
  });

  it('모든 kind 예제와 문서 유형 프로필(유스케이스·클래스·DB 명세서)이 스키마를 통과한다', () => {
    for (const k of KINDS) expect(parseProfile(k.example).issues, k.name).toEqual([]);
    for (const f of ['usecase', 'class-spec', 'db-spec']) {
      const r = parseProfile(readFileSync(at(`../../../templates/${f}/profile.yaml`), 'utf8'));
      expect(r.issues, f).toEqual([]);
    }
  });
});

describe('kind 목록·가이드', () => {
  it('describeKinds는 기본적으로 검증된 kind만 준다', () => {
    expect(describeKinds().map((k) => k.name)).toEqual([
      'fields',
      'cells',
      'repeat',
      'diagrams',
      'rows',
      'paragraphs',
      'remove',
      'text',
    ]);
  });

  it('가이드는 등록부·오류 표에서 생성되고 모든 주제가 있다', () => {
    for (const t of GUIDE_TOPICS) expect(getProfileGuide(t).markdown.length, t).toBeGreaterThan(50);
    const all = getProfileGuide().markdown;
    for (const k of KINDS) expect(all).toContain(`### ${k.name}`);
    for (const code of Object.keys(ISSUE_CODES)) expect(all).toContain(`\`${code}\``);
    expect(getProfileGuide('minimal').markdown).toContain(MINIMAL_USECASE.trimEnd());
    expect(getProfileGuide('patterns').markdown).toContain(CLASS_SPEC.trimEnd());
    expect(getProfileGuide('patterns').markdown).toContain(DB_SPEC.trimEnd());
  });

  it('프로필 레퍼런스 문서(_spec/04-conversion/profile-reference.md)가 생성 결과와 같다 (pnpm gen:docs)', () => {
    expect(readFileSync(at('../../../_spec/04-conversion/profile-reference.md'), 'utf8')).toBe(
      profileReferenceMarkdown(),
    );
  });

  it('가이드의 kind별 키 표가 스키마의 키와 일치한다', () => {
    const md = getProfileGuide('kinds').markdown;
    for (const k of KINDS) {
      for (const key of Object.keys((k.schema.properties ?? {}) as object).filter((x) => x !== 'kind'))
        expect(md, `${k.name}.${key}`).toContain(`\`${key}\``);
    }
  });
});
describe('kind 등록: 새 패턴은 등록부 한 곳으로 추가된다', () => {
  it('시험용 kind를 등록하면 스키마·점검·목록·가이드에 반영되고, 기존 프로필은 그대로 통과한다', async () => {
    const test = {
      name: 'echo',
      status: 'verified' as const,
      summary: '시험용',
      schema: {
        type: 'object',
        properties: {
          kind: { const: 'echo' },
          id: { type: 'string' },
          text: { type: 'string', description: '시험용 키' },
        },
        required: ['kind', 'text'],
        additionalProperties: false,
      },
      example:
        'version: 1\ntype: t\ntemplate: t.hwpx\nmd: { collections: {} }\nbindings:\n  - { kind: echo, text: hi }\n',
    };
    KINDS.push(test);
    try {
      expect(parseProfile(test.example).issues).toEqual([]);
      expect(describeKinds().map((k) => k.name)).toContain('echo');
      expect(getProfileGuide('kinds').markdown).toContain('### echo');
      expect(parseProfile(MINIMAL_USECASE).issues).toEqual([]);
      expect(codes(parseProfile(test.example.replace('text: hi', 'txt: hi')).issues)).toContain('unknown-key');
    } finally {
      KINDS.pop();
    }
    expect(codes(parseProfile(test.example).issues)).toContain('unknown-kind');
  });
});
