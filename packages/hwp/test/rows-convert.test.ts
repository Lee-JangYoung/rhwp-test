import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseProfile, type Profile } from '@yangsik/core';
import { convertBytes, previewMapping, ProfileError, testProfile } from '../src/index';
import { createBlankDoc, rhwpEngine } from '@yangsik/engine-rhwp/node';
import { fakeDiagram } from './util/zip';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const dir = (name: string) => at(`../../../templates/${name}`);
const load = (name: string) => ({
  profileText: readFileSync(`${dir(name)}/profile.yaml`, 'utf8'),
  template: new Uint8Array(readFileSync(`${dir(name)}/template.hwpx`)),
  md: readFileSync(`${dir(name)}/example.md`, 'utf8'),
  schema: JSON.parse(readFileSync(`${dir(name)}/schema.json`, 'utf8')) as object,
});
const profileOf = (text: string): Profile => {
  const r = parseProfile(text);
  if (!r.profile) throw new Error(JSON.stringify(r.issues));
  return r.profile;
};

/** 변환 결과의 본문 표를 "행 × 열" 텍스트 배열로 */
async function tablesOf(bytes: Uint8Array): Promise<string[][][]> {
  const s = await rhwpEngine.open(bytes);
  const out = s.topTables().map((t) => {
    const cells = s.tableCells(t);
    const rows = Math.max(...cells.map((c) => c.row)) + 1;
    return Array.from({ length: rows }, (_, r) =>
      cells
        .filter((c) => c.row === r)
        .sort((a, z) => a.col - z.col)
        .map((c) => c.text),
    );
  });
  s.dispose();
  return out;
}

describe('클래스 명세서: 표 묶음 반복(range) + rows + 중첩 repeat + onEmpty remove', () => {
  const c = load('class-spec');
  const run = (md = c.md, profileText = c.profileText) =>
    convertBytes(rhwpEngine, {
      profile: profileOf(profileText),
      mdText: md,
      template: c.template,
      dataSchema: c.schema,
      renderDiagram: fakeDiagram,
    });

  it('클래스마다 표 묶음이 복제되고, 속성·파라미터는 행으로, 메서드는 안쪽 반복으로 채워진다', async () => {
    const { bytes, report } = await run();
    expect(report.verify.checks.filter((x) => !x.ok)).toEqual([]);
    expect(report.verify.ok).toBe(true);
    expect(report.items).toBe(4); // 클래스 2 + 메서드 2
    expect(report.imagesInserted).toBe(1);

    const t = await tablesOf(bytes);
    // Member: 헤더, 속성, (메서드 헤더, 파라미터) × 2 / Session: 헤더, 속성 (메서드 없음 → 표 삭제)
    expect(t).toHaveLength(8);
    expect(t[0]).toEqual([
      ['클래스명', 'Member'],
      ['패키지', 'com.example.member'],
      ['설명', '회원 정보를 나타낸다'],
    ]);
    expect(t[1]).toEqual([
      ['속성명', '타입', '가시성', '설명'],
      ['id', 'Long', 'private', '회원 식별자'],
      ['name', 'String', 'private', '이름'],
      ['email', 'String', 'private', '이메일'],
    ]);
    expect(t[2]).toEqual([
      ['메서드명', 'login'],
      ['설명', '인증을 수행한다'],
    ]);
    expect(t[3]).toEqual([
      ['파라미터명', '타입', '설명'],
      ['email', 'String', '이메일'],
      ['password', 'String', '비밀번호'],
    ]);
    expect(t[4]).toEqual([
      ['메서드명', 'logout'],
      ['설명', '세션을 종료한다'],
    ]);
    expect(t[5]).toEqual([
      ['파라미터명', '타입', '설명'],
      ['', '', ''],
    ]); // 파라미터 없음 → 견본 행을 비움
    expect(t[6]).toEqual([
      ['클래스명', 'Session'],
      ['패키지', 'com.example.auth'],
      ['설명', '로그인 세션'],
    ]);
    expect(t[7]).toEqual([
      ['속성명', '타입', '가시성', '설명'],
      ['token', 'String', 'private', '세션 토큰'],
    ]);
  });

  it('프로필만 바꾸면 열 매핑·행 번호가 바뀐다 ({#}, 열 생략 시 비움)', async () => {
    const p = c.profileText.replace(
      "columns: { 속성명: '{이름}', 타입: '{타입}', 가시성: '{가시성}', 설명: '{설명}' }",
      "columns: { 속성명: '{#}. {이름}', 타입: '{타입}' }",
    );
    const { bytes, report } = await run(c.md, p);
    expect(report.verify.ok).toBe(true);
    const t = await tablesOf(bytes);
    expect(t[1]).toEqual([
      ['속성명', '타입', '가시성', '설명'],
      ['1. id', 'Long', '', ''],
      ['2. name', 'String', '', ''],
      ['3. email', 'String', '', ''],
    ]);
  });

  it('매핑 대조표는 표 묶음(range) 단위의 cells.in 표를 기준으로 만든다', async () => {
    const m = await previewMapping(rhwpEngine, profileOf(c.profileText), c.md, c.template);
    expect(m.templateLabels).toEqual(['클래스명', '패키지', '설명']);
    expect(m.items.map((i) => i.id)).toEqual(['Member', 'Session']);
    expect(m.items[0].rows.every((r) => r.found)).toBe(true);
    expect(m.unusedLabels).toEqual([]);
  });

  it('점검: 없는 머리글·바깥 단위 밖의 표·잘못된 range·over 종류를 코드·후보와 함께 잡는다', async () => {
    const { check } = await testProfile(rhwpEngine, {
      profile: profileOf(c.profileText.replace('속성명: ', '속성이름: ').replace('over: attributes', 'over: fields')),
      template: c.template,
      exampleMd: c.md,
    });
    const codes = check.issues.map((i) => i.code);
    expect(codes).toContain('label-not-found');
    expect(codes).toContain('slot-type-mismatch');
    const miss = check.issues.find((i) => i.code === 'label-not-found');
    expect(miss?.candidates).toContain('속성명');

    const swapped = c.profileText.replace(
      '{ range: { start: { table: { label: 클래스명 } }, end: { table: { headerLabel: 파라미터명 } } } }',
      '{ range: { start: { table: { headerLabel: 파라미터명 } }, end: { table: { label: 클래스명 } } } }',
    );
    const r = await testProfile(rhwpEngine, { profile: profileOf(swapped), template: c.template, exampleMd: c.md });
    expect(r.check.issues.map((i) => i.code)).toContain('range-invalid');
    expect(r.ok).toBe(false);
  });

  it('실행 중 확인: 레코드에 없는 키는 후보와 함께 오류', async () => {
    const p = c.profileText.replace("타입: '{타입}', 가시성", "타입: '{자료형}', 가시성");
    const err = await run(c.md, p).catch((e) => e);
    expect(err).toBeInstanceOf(ProfileError);
    expect(err.issues[0]).toMatchObject({ code: 'path-unknown' });
    expect(err.issues[0].candidates).toContain('타입');
  });
});

describe('DB 명세서: remove(행·표), rows, 위치 보정', () => {
  const d = load('db-spec');
  const run = (md = d.md) =>
    convertBytes(rhwpEngine, {
      profile: profileOf(d.profileText),
      mdText: md,
      template: d.template,
      dataSchema: d.schema,
      skipDiagrams: true,
    });

  it('인덱스가 없으면 인덱스 표를, 비고가 없으면 비고 행을 지운다', async () => {
    const { bytes, report } = await run();
    expect(report.verify.checks.filter((x) => !x.ok)).toEqual([]);
    const t = await tablesOf(bytes);
    // MEMBER: 헤더(비고 있음), 컬럼, 인덱스 / LOGIN_LOG: 헤더(비고 행 삭제), 컬럼 (인덱스 표 삭제)
    expect(t).toHaveLength(5);
    expect(t[0]).toEqual([
      ['테이블명', 'MEMBER'],
      ['설명', '회원 마스터'],
      ['비고', '탈퇴 회원도 보관한다'],
    ]);
    expect(t[1].slice(1)).toEqual([
      ['ID', 'BIGINT', '20', 'N', '회원 식별자'],
      ['NAME', 'VARCHAR', '50', 'N', '이름'],
      ['EMAIL', 'VARCHAR', '100', 'Y', '이메일'],
    ]);
    expect(t[2]).toEqual([
      ['인덱스명', '컬럼', '유니크'],
      ['PK_MEMBER', 'ID', 'Y'],
      ['IX_MEMBER_EMAIL', 'EMAIL', 'N'],
    ]);
    expect(t[3]).toEqual([
      ['테이블명', 'LOGIN_LOG'],
      ['설명', '로그인 이력'],
    ]);
    expect(t[4]).toHaveLength(3);
    expect(report.verify.checks.some((x) => x.name === '표별 행 수 저장 전후 동일' && x.ok)).toBe(true);
  });

  it('YAML이 문자열이 아닌 값으로 읽는 키(NULL)는 오류로 알려 준다', () => {
    const r = parseProfile(d.profileText.replace("'NULL': '{NULL}'", 'NULL: "{NULL}"'));
    expect(r.profile).toBeUndefined();
    expect(r.issues[0]).toMatchObject({ code: 'yaml-ambiguous-key' });
    expect(r.issues[0].message).toContain("'NULL'");
  });
});

describe('문서 전체가 하나의 목록 표 (repeat 없이 rows, 컬렉션의 항목이 한 행)', () => {
  function listTemplate(): Uint8Array {
    const doc = createBlankDoc();
    doc.insertText(0, 0, 0, '인터페이스 목록');
    const p = doc.getParagraphCount(0);
    doc.insertParagraph(0, p);
    const r = JSON.parse(doc.createTable(0, p, 0, 3, 3)) as { paraIdx: number; controlIdx: number };
    ['번호', '이름', '설명', '(번호)', '(이름)', '(설명)', '합계', '', ''].forEach((t, i) => {
      if (t) doc.insertTextInCell(0, r.paraIdx, r.controlIdx, i, 0, 0, t);
    });
    const bytes = new Uint8Array(doc.exportHwpx());
    doc.free();
    return bytes;
  }
  const PROFILE = `version: 1
type: interface-list
template: t.hwpx
md:
  collections:
    interfaces:
      heading: { level: 2, pattern: '{id} {name}' }
      slots:
        - { as: kv, key: fields }
bindings:
  - kind: rows
    in: { table: { headerLabel: 번호 } }
    over: interfaces
    columns: { 번호: '{#}', 이름: '{id} {name}', 설명: '{fields.설명} ' }
`;
  const MD =
    '## IF-01 로그인\n\n| 항목 | 내용 |\n|---|---|\n| 설명 | 인증 API |\n\n## IF-02 조회\n\n| 항목 | 내용 |\n|---|---|\n| 설명 | 목록 조회 |\n';

  it('견본 행만 레코드 수만큼 늘고, 아래의 고정 행(합계)은 그대로다', async () => {
    const { bytes, report } = await convertBytes(rhwpEngine, {
      profile: profileOf(PROFILE),
      mdText: MD,
      template: listTemplate(),
    });
    expect(report.verify.ok).toBe(true);
    const [t] = await tablesOf(bytes);
    expect(t).toEqual([
      ['번호', '이름', '설명'],
      ['1', 'IF-01 로그인', '인증 API '],
      ['2', 'IF-02 조회', '목록 조회 '],
      ['합계', '', ''],
    ]);
  });

  it('onEmpty: removeRow는 견본 행을 지우고, 기본(clear)은 비운다', async () => {
    const empty = '';
    const base = {
      profile: profileOf(PROFILE.replace('over: interfaces', 'over: interfaces\n    onEmpty: removeRow')),
      mdText: empty,
      template: listTemplate(),
    };
    const { bytes } = await convertBytes(rhwpEngine, base);
    expect((await tablesOf(bytes))[0]).toEqual([
      ['번호', '이름', '설명'],
      ['합계', '', ''],
    ]);
    const cleared = await convertBytes(rhwpEngine, { ...base, profile: profileOf(PROFILE) });
    expect((await tablesOf(cleared.bytes))[0]).toEqual([
      ['번호', '이름', '설명'],
      ['', '', ''],
      ['합계', '', ''],
    ]);
  });
});

describe('text(토큰 치환)·paragraphs(문단 전개): front-matter 기반, repeat 밖', () => {
  const template = new Uint8Array(readFileSync(at('../../../templates/report/template.hwpx')));
  const PROFILE = `version: 1
type: report
template: template.hwpx
md:
  frontMatter: meta
  collections: {}
bindings:
  - { kind: text, map: { 작성자: '{meta.author}', 작성일: '{meta.date}' } }
  - { kind: paragraphs, at: { paragraph: { text: '{{요약}}' } }, from: meta.summary, format: numbered }
`;
  const md =
    '---\nauthor: 홍길동\ndate: 2026-10-15\nsummary:\n  - 변환 도구를 만들었다\n  - 양식을 지원한다\n  - 검증한다\n---\n';
  const run = (profile = PROFILE, text = md) =>
    convertBytes(rhwpEngine, { profile: profileOf(profile), mdText: text, template });

  it('토큰은 값으로 바뀌고, 표식 문단은 줄마다 같은 서식의 문단으로 늘어난다', async () => {
    const { bytes, report } = await run();
    expect(report.verify.checks.filter((c) => !c.ok)).toEqual([]);
    const s = await rhwpEngine.open(bytes);
    expect(s.bodyParagraphs()).toEqual([
      '보고서',
      '작성자: 홍길동',
      '작성일: 2026-10-15',
      '1. 변환 도구를 만들었다',
      '2. 양식을 지원한다',
      '3. 검증한다',
      '※ 합성 양식입니다.',
    ]);
    s.dispose();
  });

  it('값이 없으면 문단을 비우고(clear), onEmpty: keep이면 표식을 그대로 둔다', async () => {
    const noSummary = md.replace(/summary:[\s\S]*?(?=---\n$)/, '');
    const a = await run(PROFILE, noSummary);
    const s = await rhwpEngine.open(a.bytes);
    expect(s.bodyParagraphs()).toContain('');
    expect(s.bodyParagraphs().some((p) => p.includes('{{요약}}'))).toBe(false);
    s.dispose();
    const k = await run(PROFILE.replace('format: numbered', 'format: numbered, onEmpty: keep'), noSummary);
    const s2 = await rhwpEngine.open(k.bytes);
    expect(s2.bodyParagraphs()).toContain('{{요약}}');
    s2.dispose();
  });

  it('점검: 없는 토큰·표식은 후보와 함께, repeat 안의 사용·meta가 아닌 from은 거부', async () => {
    const bad = PROFILE.replace('작성자:', '글쓴이:').replace("'{{요약}}'", "'{{개요}}'");
    const r = await testProfile(rhwpEngine, { profile: profileOf(bad), template, exampleMd: md });
    const codes = r.check.issues.map((i) => i.code);
    expect(codes).toContain('token-not-found');
    expect(codes).toContain('paragraph-not-found');
    expect(r.check.issues.find((i) => i.code === 'token-not-found')?.candidates).toContain('작성자');
    const inRepeat = `version: 1
type: t
template: t.hwpx
md:
  collections:
    items:
      heading: { level: 2, pattern: '{n}' }
bindings:
  - kind: repeat
    over: items
    unit: { table: { index: 0 } }
    do:
      - { kind: text, map: { 작성자: '{n}' } }
`;
    const r2 = await testProfile(rhwpEngine, { profile: profileOf(inRepeat), template, exampleMd: '' });
    expect(r2.check.issues.map((i) => i.code)).toContain('kind-not-supported');
  });
});
