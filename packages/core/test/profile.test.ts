import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyzeTemplate,
  buildProfileSchema,
  checkProfile,
  describeKinds,
  getProfileGuide,
  GUIDE_TOPICS,
  ISSUE_CODES,
  parseProfile,
  type Issue,
} from '../src/index';
import { CLASS_SPEC, DB_SPEC, KINDS, MINIMAL_USECASE } from '../src/profile/kinds';
import { loadProfileFile, rhwpEngine } from '../src/node/index';
import { profileReferenceMarkdown } from '../../../tools/profile-docs';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const USECASE_PROFILE = at('../../../templates/usecase/profile.yaml');
const TEMPLATE = new Uint8Array(readFileSync(at('../../../templates/usecase/template.hwpx')));

const templateOf = (name: string) => new Uint8Array(readFileSync(at(`../../../templates/${name}/template.hwpx`)));

/** 텍스트 → 스키마 검증 → 양식 점검 (기본 양식: usecase) */
async function run(text: string, template: Uint8Array = TEMPLATE) {
  const r = parseProfile(text);
  if (!r.profile) return { stage: 'parse' as const, ok: false, issues: r.issues };
  const c = await checkProfile(rhwpEngine, r.profile, template, { lineOf: r.lineOf });
  return { stage: 'check' as const, ok: c.ok, issues: c.issues };
}
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

describe('점검: 양식과 대조', () => {
  it('최소 프로필은 합성 양식 점검을 통과한다', async () => {
    const r = await run(MINIMAL_USECASE);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('verified kind 예제는 모두 점검을 통과한다(오류 없음)', async () => {
    for (const k of KINDS.filter((x) => x.status === 'verified')) {
      const r = await run(k.example, templateOf(k.exampleTemplate ?? 'usecase'));
      expect(
        r.issues.filter((i) => i.severity === 'error'),
        k.name,
      ).toEqual([]);
    }
  });

  it('정의만 된(defined) kind는 점검이 "아직 지원하지 않음"으로 거부한다', async () => {
    expect(KINDS.filter((x) => x.status === 'defined')).toEqual([]); // 현재는 모두 검증됨
    const probe = {
      name: 'probe',
      status: 'defined' as const,
      summary: '시험용',
      schema: {
        type: 'object',
        properties: { kind: { const: 'probe' } },
        required: ['kind'],
        additionalProperties: false,
      },
      example: 'version: 1\ntype: t\ntemplate: t.hwpx\nmd: { collections: {} }\nbindings:\n  - { kind: probe }\n',
    };
    KINDS.push(probe);
    try {
      const r = await run(probe.example);
      expect(codes(r.issues)).toContain('kind-not-supported');
      expect(r.ok).toBe(false);
      expect(describeKinds().map((k) => k.name)).not.toContain('probe');
    } finally {
      KINDS.pop();
    }
  });

  it('클래스·DB 명세서 프로필은 각 양식의 점검을 통과한다', async () => {
    for (const [name, text] of [
      ['class-spec', CLASS_SPEC],
      ['db-spec', DB_SPEC],
    ] as const) {
      const r = await run(text, templateOf(name));
      expect(
        r.issues.filter((i) => i.severity === 'error'),
        name,
      ).toEqual([]);
    }
  });
});

describe('LLM이 자주 내는 오류는 코드·경로·후보와 함께 보고된다', () => {
  const swap = (a: string, b: string) => MINIMAL_USECASE.replace(a, b);
  const cases: { name: string; text: string; code: string; path: string; candidate?: string; line?: boolean }[] = [
    {
      name: '키 오타',
      text: swap('over: items', 'ovr: items'),
      code: 'unknown-key',
      path: 'bindings[1].ovr',
      candidate: 'over',
      line: true,
    },
    {
      name: 'kind 오타',
      text: swap('kind: repeat', 'kind: repeet'),
      code: 'unknown-kind',
      path: 'bindings[1].kind',
      candidate: 'repeat',
    },
    { name: 'kind 누락', text: swap('{ kind: fields, map', '{ map'), code: 'missing-key', path: 'bindings[0].kind' },
    { name: '필수 키 누락(over)', text: swap('    over: items\n', ''), code: 'missing-key', path: 'bindings[1]' },
    {
      name: 'enum 값 오류',
      text: swap('lang: mermaid }', 'lang: mermaid }\n      x: 1').replace('as: kv', 'as: kv2'),
      code: 'invalid-value',
      path: 'md.collections.items.slots[0].as',
      candidate: 'kv',
    },
    {
      name: '양식에 없는 라벨',
      text: swap('유스케이스명:', '유스케이스 이름:'),
      code: 'label-not-found',
      path: 'bindings[1].do[0].map.유스케이스 이름',
      candidate: '유스케이스명',
      line: true,
    },
    {
      name: '양식에 없는 누름틀',
      text: swap('문서명', '문서 이름'),
      code: 'field-not-found',
      path: 'bindings[0].map.meta.title',
      candidate: '문서명',
    },
    {
      name: '데이터 경로 오타',
      text: swap("'{name}'", "'{nam}'"),
      code: 'path-unknown',
      path: 'bindings[1].do[0].map.유스케이스명',
      candidate: 'name',
    },
    {
      name: '선언하지 않은 컬렉션',
      text: swap('over: items', 'over: item'),
      code: 'collection-unknown',
      path: 'bindings[1].over',
      candidate: 'items',
    },
    {
      name: '없는 표',
      text: swap('label: UC ID', 'label: 없는라벨'),
      code: 'table-not-found',
      path: 'bindings[1].unit',
    },
    {
      name: '슬롯 종류 불일치',
      text: swap('from: diagrams', 'from: main'),
      code: 'slot-type-mismatch',
      path: 'bindings[1].do[1].from',
    },
    {
      name: '필수 바인딩(do) 비어 있음',
      text: swap('    do:\n', '    do: []\n    zzz:\n'),
      code: 'invalid-value',
      path: 'bindings[1].do',
    },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const r = await run(c.text);
      expect(r.ok).toBe(false);
      const hit = r.issues.find((i) => i.code === c.code && i.path.startsWith(c.path));
      expect(hit, JSON.stringify(r.issues)).toBeDefined();
      if (c.candidate) expect(hit?.candidates).toContain(c.candidate);
      if (c.line) expect(hit?.line).toBeGreaterThan(0);
    });
  }

  it('YAML 문법 오류는 줄 번호와 함께 보고된다', () => {
    const r = parseProfile('version: 1\ntype: x\n  bad: [');
    expect(codes(r.issues)).toContain('yaml-syntax');
    expect(r.issues[0].line).toBeGreaterThan(0);
  });

  it('정책이 warn이면 라벨 누락이 경고가 되고, ignore면 사라진다', async () => {
    const base = swap('유스케이스명:', '유스케이스 이름:');
    const warn = await run(`${base}policy: { onMissingLabel: warn }\n`);
    expect(warn.ok).toBe(true);
    expect(warn.issues.find((i) => i.code === 'label-not-found')?.severity).toBe('warning');
    const ignore = await run(`${base}policy: { onMissingLabel: ignore }\n`);
    expect(codes(ignore.issues)).not.toContain('label-not-found');
  });

  it('쓰이지 않는 슬롯은 경고(slot-unused)다', async () => {
    const r = await run(swap("          '*': fields\n", ''));
    expect(r.issues.find((i) => i.code === 'slot-unused')?.severity).toBe('warning');
  });

  it('모든 오류 코드에 설명과 고치는 법이 있다', () => {
    for (const [code, v] of Object.entries(ISSUE_CODES)) {
      expect(v.summary, code).toBeTruthy();
      expect(v.fix, code).toBeTruthy();
    }
  });
});

describe('양식 분석(LLM 입력)·kind 목록·가이드', () => {
  it('analyzeTemplate은 표의 라벨·머리글과 누름틀을 JSON으로 준다', async () => {
    const f = await analyzeTemplate(rhwpEngine, TEMPLATE);
    expect(f.fields.map((x) => x.name)).toEqual(['문서명', '버전', '작성자', '작성일']);
    expect(f.tables).toHaveLength(1);
    expect(f.tables[0].labels).toEqual([
      'UC ID',
      '유스케이스명',
      '액터',
      '사전조건',
      '사후조건',
      '기본 흐름',
      '대안 흐름',
    ]);
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });

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
