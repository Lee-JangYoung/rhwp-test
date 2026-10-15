import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  convertBytes,
  parseProfile,
  previewMapping,
  ProfileError,
  readMarkdown,
  testProfile,
  type Profile,
} from '../src/index';
import { createBlankDoc, rhwpEngine } from '../src/node/index';
import { fakeDiagram, zipEntryHashes } from './util/zip';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const USECASE = at('../../../templates/usecase');
const PROFILE_TEXT = readFileSync(join(USECASE, 'profile.yaml'), 'utf8');
const TEMPLATE = new Uint8Array(readFileSync(join(USECASE, 'template.hwpx')));
const SCHEMA = JSON.parse(readFileSync(join(USECASE, 'schema.json'), 'utf8')) as object;
const EXAMPLE = readFileSync(join(USECASE, 'example.md'), 'utf8');
const LONG = readFileSync(join(USECASE, 'fixtures/long.md'), 'utf8');

const profileOf = (text: string): Profile => {
  const r = parseProfile(text);
  if (!r.profile) throw new Error(JSON.stringify(r.issues));
  return r.profile;
};

async function run(profileText: string, mdText = EXAMPLE, extra: object = {}) {
  return convertBytes(rhwpEngine, {
    profile: profileOf(profileText),
    mdText,
    template: TEMPLATE,
    dataSchema: SCHEMA,
    skipDiagrams: true,
    ...extra,
  });
}
/** 변환 결과 파일에서 표 i의 "라벨 → 값" */
async function blocksOf(bytes: Uint8Array) {
  const s = await rhwpEngine.open(bytes);
  const out = s.topTables().map((t) => {
    const cells = s.tableCells(t);
    return Object.fromEntries(
      cells
        .filter((c) => c.col === 0)
        .map((c) => [c.text, cells.find((v) => v.row === c.row && v.col === 1)?.text ?? '']),
    );
  });
  s.dispose();
  return out;
}

describe('동작 보존: 프로필 기반 변환이 이전(하드코딩) 변환과 같은 결과를 낸다', () => {
  const golden = JSON.parse(readFileSync(at('./golden/usecase.json'), 'utf8')) as Record<
    string,
    { report: Record<string, unknown>; entries: Record<string, string> }
  >;
  for (const [name, md] of [
    ['example', EXAMPLE],
    ['long', LONG],
  ] as const) {
    it(`${name}: 변환 보고와 HWPX의 모든 ZIP 항목(SHA-256)이 골든과 같다`, async () => {
      const { bytes, report: r } = await run(PROFILE_TEXT, md, { skipDiagrams: false, renderDiagram: fakeDiagram });
      expect({
        items: r.items,
        fieldsSet: r.fieldsSet,
        cloned: r.cloned,
        cellsSet: r.cellsSet,
        imagesInserted: r.imagesInserted,
        pages: r.pages,
        warnings: r.warnings,
        verifyOk: r.verify.ok,
        checks: r.verify.checks.map((c) => c.name),
      }).toEqual(golden[name].report);
      expect(zipEntryHashes(bytes)).toEqual(golden[name].entries);
    });
  }
});

describe('프로필을 바꾸면 매핑이 바뀐다 (코드 수정 없이)', () => {
  it('라벨 매핑: 사전조건 칸에 다른 값을 넣는다', async () => {
    const p = PROFILE_TEXT.replace(
      "          '*': fields",
      "          사전조건: '{name} 전에 {fields.사전조건}'\n          '*': fields",
    );
    const b = await blocksOf((await run(p)).bytes);
    expect(b[0].사전조건).toBe('로그인 전에 회원가입이 완료되어 있다');
    expect(b[0].액터).toBe('일반 회원'); // '*'는 나머지만 채운다
  });

  it('번호 형식: numbered → bulleted', async () => {
    const p = PROFILE_TEXT.replace(
      '기본 흐름: { from: main, format: numbered }',
      '기본 흐름: { from: main, format: bulleted }',
    );
    const b = await blocksOf((await run(p)).bytes);
    expect(b[0]['기본 흐름']).toBe(
      '- 사용자가 ID와 비밀번호를 입력한다.\n- 시스템이 인증 정보를 확인한다.\n- 시스템이 메인 화면을 표시한다.',
    );
  });

  it('누름틀 매핑: 다른 데이터를 다른 누름틀에 넣는다', async () => {
    // 문서명 ↔ 작성자 누름틀의 데이터를 서로 바꾼다
    const p = PROFILE_TEXT.replace('meta.title: 문서명', 'meta.title: 작성자').replace(
      'meta.author: 작성자',
      'meta.author: 문서명',
    );
    const { report, bytes } = await run(p);
    expect(report.verify.checks.find((c) => c.name === '필드 "작성자" 값 유지')?.ok).toBe(true);
    const s = await rhwpEngine.open(bytes);
    expect(s.getField('작성자')).toBe('회원 유스케이스 명세서');
    s.dispose();
  });

  it('unmappedValue: keep이면 값이 없는 라벨의 양식 안내 문구를 그대로 둔다', async () => {
    const p = PROFILE_TEXT.replace(
      "          '*': fields",
      "          '*': fields\n        unmappedValue: keep",
    ).replace('          대안 흐름: { from: alt, format: numbered }\n', '');
    const b = await blocksOf(
      (await run(p, EXAMPLE.replace(/### 대안 흐름\n\n1\. 인증에 실패하면 오류 메시지를 표시한다\.\n/, ''))).bytes,
    );
    expect(b[0]['대안 흐름']).toBe('(입력)'); // 비우지 않음
    const clear = await blocksOf(
      (await run(PROFILE_TEXT.replace('          대안 흐름: { from: alt, format: numbered }\n', ''))).bytes,
    );
    expect(clear[0]['대안 흐름']).toBe(''); // 기본은 clear
  });

  it('값이 없는 선택 슬롯은 default로 채울 수 있다', async () => {
    const p = PROFILE_TEXT.replace(
      '대안 흐름: { from: alt, format: numbered }',
      "대안 흐름: { from: alt, format: numbered, default: '없음' }",
    );
    const b = await blocksOf((await run(p)).bytes);
    expect(b[1]['대안 흐름']).toBe('없음'); // UC-002는 대안 흐름이 없다
  });
});

describe('점검·정책: 프로필이 양식과 맞지 않으면 변환하지 않는다', () => {
  it('양식에 없는 라벨을 매핑하면 ProfileError(구조화 오류)로 변환이 막힌다', async () => {
    const p = PROFILE_TEXT.replace('유스케이스명:', '유스케이스 이름:');
    const err = await run(p).catch((e) => e);
    expect(err).toBeInstanceOf(ProfileError);
    expect((err as ProfileError).issues[0]).toMatchObject({
      code: 'label-not-found',
      candidates: expect.arrayContaining(['유스케이스명']),
    });
  });

  it('md의 kv에 양식에 없는 키가 있으면 기본 정책(error)으로 거부되고, warn이면 경고하며 변환한다', async () => {
    const md = EXAMPLE.replace(
      '| 사후조건 | 세션이 생성된다 |',
      '| 사후조건 | 세션이 생성된다 |\n| 관련 요구사항 | REQ-1 |',
    );
    const err = await run(PROFILE_TEXT, md).catch((e) => e);
    expect(err).toBeInstanceOf(ProfileError);
    expect((err as ProfileError).issues[0].code).toBe('label-not-found');
    const warn = await run(`${PROFILE_TEXT}policy: { onMissingLabel: warn }\n`, md);
    expect(warn.report.issues.some((i) => i.code === 'label-not-found' && i.severity === 'warning')).toBe(true);
    expect(warn.report.verify.ok).toBe(true);
  });

  it('렌더러가 없으면 policy.onMissingRenderer를 따른다 (skipDiagrams는 명시적 생략)', async () => {
    const err = await run(PROFILE_TEXT, EXAMPLE, { skipDiagrams: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ProfileError);
    expect((err as ProfileError).issues[0].code).toBe('renderer-missing');
    const ok = await run(`${PROFILE_TEXT}policy: { onMissingRenderer: ignore }\n`, EXAMPLE, { skipDiagrams: false });
    expect(ok.report.imagesInserted).toBe(0);
  });

  it('항목이 없으면(collection-empty) 기본적으로 오류, onEmpty: keep이면 양식을 그대로 둔다', async () => {
    const empty = '---\ntitle: t\nversion: "1"\nauthor: a\ndate: 2026-10-14\n---\n';
    const noSchema = { dataSchema: undefined };
    const err = await run(PROFILE_TEXT, empty, noSchema).catch((e) => e);
    expect((err as ProfileError).issues[0].code).toBe('collection-empty');
    const keep = await run(
      PROFILE_TEXT.replace('    over: items\n', '    over: items\n    onEmpty: keep\n'),
      empty,
      noSchema,
    );
    expect(keep.report.items).toBe(0);
  });
});

describe('md 일반 파서 (프로필로 구동, 엄격)', () => {
  const profile = (md: string) =>
    profileOf(
      `version: 1\ntype: t\ntemplate: t.hwpx\n${md}\nbindings:\n  - { kind: fields, map: { meta.title: 문서명 } }\n`,
    );

  it('캡처·슬롯(kv, records, list, text, code)·하위 컬렉션을 읽고 줄 번호를 남긴다', () => {
    const p = profile(`md:
  frontMatter: meta
  collections:
    classes:
      heading: { level: 2, pattern: '{name} ({kind})' }
      slots:
        - { as: kv, key: fields }
        - { as: records, key: attributes, under: 속성 }
        - { as: text, key: summary, under: 개요 }
        - { as: code, key: diagrams, lang: mermaid }
      children:
        methods:
          heading: { level: 3, pattern: '{name}' }
          slots:
            - { as: list, key: steps }`);
    const md = `---
title: 클래스 명세
---

## User (class)

| 항목 | 내용 |
|---|---|
| 설명 | 회원 |

### 개요

회원을 나타낸다.
둘째 문단.

### 속성

| 이름 | 타입 |
|---|---|
| id | long |
| name | string |

\`\`\`mermaid
classDiagram
  class User
\`\`\`

### login

1. 인증한다
2. 세션을 만든다
`;
    const r = readMarkdown(p, md);
    expect(r.violations).toEqual([]);
    const user = (r.data.classes as Record<string, unknown>[])[0];
    expect(user).toMatchObject({
      name: 'User',
      kind: 'class',
      fields: { 설명: '회원' },
      summary: '회원을 나타낸다.\n둘째 문단.',
      attributes: [
        { 이름: 'id', 타입: 'long' },
        { 이름: 'name', 타입: 'string' },
      ],
      diagrams: ['classDiagram\n  class User'],
      methods: [{ name: 'login', steps: ['인증한다', '세션을 만든다'] }],
    });
    expect((r.data.meta as { title: string }).title).toBe('클래스 명세');
    expect(r.lines.get('/classes/0')).toBe(5);
    expect(r.lines.get('/classes/0/attributes/1')).toBe(21);
    expect(r.lines.get('/classes/0/methods/0/steps/1')).toBe(31);
  });

  const simple = profile(`md:
  collections:
    items:
      heading: { level: 2, pattern: '{id} {name}' }
      slots:
        - { as: kv, key: fields }
        - { as: list, key: flow, under: 흐름 }`);

  it('엄격: 제목이 패턴과 맞지 않으면 위반', () => {
    const r = readMarkdown(simple, '## 제목만\n');
    expect(r.violations[0]).toMatchObject({ line: 1, message: expect.stringContaining('제목이 패턴과 맞지 않음') });
  });

  it('엄격: 슬롯에 연결되지 않은 표·목록과 중첩 목록은 위반, 필수 슬롯 누락도 위반', () => {
    const r = readMarkdown(
      simple,
      '## A-1 이름\n\n| k | v |\n|---|---|\n| a | b |\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n### 흐름\n\n- 하나\n  - 중첩\n\n문단\n\n- 둘째 목록\n',
    );
    const msgs = r.violations.map((v) => v.message);
    expect(msgs).toContain('슬롯에 연결되지 않은 표');
    expect(msgs).toContain('중첩 목록은 지원하지 않음');
    expect(msgs).toContain('슬롯에 연결되지 않은 목록');
    const missing = readMarkdown(simple, '## A-1 이름\n');
    expect(missing.violations.map((v) => v.message)).toEqual([
      '필수 항목 누락: fields (표가 없음)',
      "필수 항목 누락: flow (제목 '흐름'가 없음)",
    ]);
  });

  it('쓰이지 않은 제목은 위반(내용이 조용히 사라지지 않게), kv 중복 키도 위반', () => {
    const r = readMarkdown(
      simple,
      '## A-1 이름\n\n| k | v |\n|---|---|\n| a | b |\n| a | c |\n\n### 흐름\n\n- 하나\n\n### 기타\n',
    );
    expect(r.warnings).toEqual([]);
    expect(r.violations.map((v) => v.message)).toEqual([
      '키가 중복됨: a',
      expect.stringContaining("알 수 없는 제목: '기타'"),
    ]);
  });
});

describe('cells value: below (라벨 아래 칸이 값)', () => {
  it('라벨 셀 바로 아래 칸에 값을 채운다', async () => {
    const d = createBlankDoc();
    d.insertText(0, 0, 0, '양식');
    const p = d.getParagraphCount(0);
    d.insertParagraph(0, p);
    const r = JSON.parse(d.createTable(0, p, 0, 2, 2)) as { paraIdx: number; controlIdx: number };
    d.insertTextInCell(0, r.paraIdx, r.controlIdx, 0, 0, 0, '이름');
    d.insertTextInCell(0, r.paraIdx, r.controlIdx, 1, 0, 0, '부서');
    d.insertTextInCell(0, r.paraIdx, r.controlIdx, 2, 0, 0, '(입력)');
    d.insertTextInCell(0, r.paraIdx, r.controlIdx, 3, 0, 0, '(입력)');
    const tpl = new Uint8Array(d.exportHwpx());
    d.free();
    const prof = profileOf(`version: 1
type: t
template: t.hwpx
md:
  collections:
    people:
      heading: { level: 2, pattern: '{name} / {dept}' }
bindings:
  - kind: repeat
    over: people
    unit: { table: { label: 이름 } }
    do:
      - kind: cells
        value: below
        labelColumn: 0
        map: { 이름: '{name}' }
        unmappedValue: keep
`);
    const out = await convertBytes(rhwpEngine, { profile: prof, mdText: '## 홍길동 / 개발팀\n', template: tpl });
    expect(out.report.verify.ok).toBe(true);
    const s = await rhwpEngine.open(out.bytes);
    const cells = s.tableCells(s.topTables()[0]);
    expect(cells.map((c) => `${c.row},${c.col}:${c.text}`)).toEqual([
      '0,0:이름',
      '0,1:부서',
      '1,0:홍길동',
      '1,1:(입력)',
    ]);
    s.dispose();
  });
});

describe('드라이런·매핑 미리보기', () => {
  it('testProfile: 정상 프로필은 점검·변환·자체 검증을 통과하고 매핑 대조표를 준다', async () => {
    const r = await testProfile(rhwpEngine, {
      profile: profileOf(PROFILE_TEXT),
      template: TEMPLATE,
      exampleMd: EXAMPLE,
      dataSchema: SCHEMA,
    });
    expect(r.ok).toBe(true);
    expect(r.report?.items).toBe(3);
    expect(r.mapping?.items.map((i) => i.id)).toEqual(['UC-001', 'UC-002', 'UC-003']);
    expect(r.mapping?.items[0].rows.every((x) => x.found)).toBe(true);
  });

  it('testProfile: 점검 실패는 던지지 않고 결과에 담는다', async () => {
    const r = await testProfile(rhwpEngine, {
      profile: profileOf(PROFILE_TEXT.replace('label: UC ID', 'label: 없음')),
      template: TEMPLATE,
      exampleMd: EXAMPLE,
    });
    expect(r.ok).toBe(false);
    expect(r.check.issues[0].code).toBe('table-not-found');
  });

  it('testProfile: 예제 md가 규약에 맞지 않으면 위반을 담는다', async () => {
    const r = await testProfile(rhwpEngine, {
      profile: profileOf(PROFILE_TEXT),
      template: TEMPLATE,
      exampleMd: readFileSync(join(USECASE, 'fixtures/bad1.md'), 'utf8'),
      dataSchema: SCHEMA,
    });
    expect(r.ok).toBe(false);
    expect(r.violations?.length).toBeGreaterThan(0);
  });

  it('previewMapping: 프로필에서 매핑 대조표를 만든다', async () => {
    const m = await previewMapping(rhwpEngine, profileOf(PROFILE_TEXT), EXAMPLE, TEMPLATE);
    expect(m.templateLabels).toContain('유스케이스명');
    expect(m.items[0].rows.find((r) => r.label === '액터')).toEqual({ label: '액터', value: '일반 회원', found: true });
  });
});

describe('하드코딩 제거', () => {
  it('변환 코드에 유스케이스 전용 문자열·타입이 없다', () => {
    const src = at('../src');
    const files = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)],
      );
    // 프로필 등록부의 예제(kinds.ts)와 가이드 문구(guide.ts)는 예시로 유스케이스를 쓴다
    const code = files(src).filter((f) => !/profile\/(kinds|guide|issues)\.ts$/.test(f));
    const banned = ['FIELD_MAP', 'UC ID', '유스케이스', 'UseCaseItem', '기본 흐름', '대안 흐름'];
    const hits = code.flatMap((f) =>
      banned.filter((b) => readFileSync(f, 'utf8').includes(b)).map((b) => `${relative(src, f)}: ${b}`),
    );
    expect(hits).toEqual([]);
  });
});
