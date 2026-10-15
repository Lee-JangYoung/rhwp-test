import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeTemplate, checkProfile, describeKinds, ISSUE_CODES, type Issue, parseProfile } from '@yangsik/core';
import { CLASS_SPEC, DB_SPEC, KINDS, MINIMAL_USECASE } from '@yangsik/core/kinds';
import { rhwpEngine } from '@yangsik/engine-rhwp/node';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
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

describe('양식 분석(LLM 입력)', () => {
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
});
