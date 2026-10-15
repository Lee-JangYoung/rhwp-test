// I-9: 점검이 풀어낸 위치를 실행이 그대로 쓰고(실행 계획), md는 데이터를 조용히 버리지 않는다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { convertBytes, type Profile, parseProfile, readMarkdown, testProfile } from '../src/index';
import { rhwpEngine } from '../../engine-rhwp/src/node';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const load = (n: string) => ({
  profileText: readFileSync(at(`../../../templates/${n}/profile.yaml`), 'utf8'),
  template: new Uint8Array(readFileSync(at(`../../../templates/${n}/template.hwpx`))),
  md: readFileSync(at(`../../../templates/${n}/example.md`), 'utf8'),
  schema: JSON.parse(readFileSync(at(`../../../templates/${n}/schema.json`), 'utf8')) as object,
});
const profileOf = (text: string): Profile => {
  const r = parseProfile(text);
  if (!r.profile) throw new Error(JSON.stringify(r.issues));
  return r.profile;
};
const HEAD = 'version: 1\ntype: t\ntemplate: t.hwpx\n';

describe('실행 계획: 지울 수 있는 표·라벨을 뒤에서 쓰면 점검이 거부한다', () => {
  const d = load('db-spec');
  const codes = async (text: string) =>
    (
      await testProfile(rhwpEngine, { profile: profileOf(text), template: d.template, exampleMd: d.md })
    ).check.issues.map((i) => i.code);

  it('remove(표) 뒤에 그 표의 rows가 오면 target-removed (이전에는 점검을 통과해 실행에서 터졌다)', async () => {
    const moved = d.profileText.replace(
      /      - kind: rows\n        in: \{ table: \{ headerLabel: 인덱스명 \} \}\n[\s\S]*?\n      - \{ kind: remove, target: \{ table: \{ headerLabel: 인덱스명 \} \}, when: 'empty\(indexes\)' \}\n/,
      "      - { kind: remove, target: { table: { headerLabel: 인덱스명 } }, when: 'empty(indexes)' }\n      - kind: rows\n        in: { table: { headerLabel: 인덱스명 } }\n        over: indexes\n        columns: { 인덱스명: '{인덱스명}', 컬럼: '{컬럼}', 유니크: '{유니크}' }\n",
    );
    expect(moved).not.toBe(d.profileText);
    expect(await codes(moved)).toContain('target-removed');
    // 원래 순서(rows 다음에 remove)는 통과
    expect((await codes(d.profileText)).filter((c) => c === 'target-removed')).toEqual([]);
  });

  it('remove(행) 뒤에 그 라벨을 cells로 채우면 target-removed', async () => {
    const swapped = d.profileText
      .replace(
        "      - { kind: cells, in: { table: { label: 테이블명 } }, map: { 테이블명: '{name}', '*': fields } }\n",
        '',
      )
      .replace(
        "      - { kind: remove, in: { table: { label: 테이블명 } }, target: { row: { label: 비고 } }, when: 'empty(fields.비고)' }\n",
        "      - { kind: remove, in: { table: { label: 테이블명 } }, target: { row: { label: 비고 } }, when: 'empty(fields.비고)' }\n      - { kind: cells, in: { table: { label: 테이블명 } }, map: { 테이블명: '{name}', 비고: '{fields.비고}' } }\n",
      );
    expect(await codes(swapped)).toContain('target-removed');
  });

  it('repeat.onEmpty: remove 뒤에 그 표를 쓰는 바인딩도 거부', async () => {
    const c = load('class-spec');
    const p = c.profileText.replace(
      '      - { kind: diagrams, from: diagrams }\n',
      '      - { kind: diagrams, from: diagrams }\n',
    );
    const r = await testProfile(rhwpEngine, {
      profile: profileOf(`${p.trimEnd()}\n`),
      template: c.template,
      exampleMd: c.md,
    });
    expect(r.check.issues.filter((i) => i.severity === 'error')).toEqual([]);
    // 안쪽 repeat(onEmpty: remove) 뒤에 같은 표를 쓰는 cells를 추가
    const bad = p.replace(
      '      - { kind: diagrams, from: diagrams }',
      '      - { kind: cells, in: { table: { label: 메서드명 } }, map: { 메서드명: x } }\n      - { kind: diagrams, from: diagrams }',
    );
    const r2 = await testProfile(rhwpEngine, { profile: profileOf(bad), template: c.template, exampleMd: c.md });
    expect(r2.check.issues.map((i) => i.code)).toContain('target-removed');
  });
});

describe('md는 데이터를 조용히 버리지 않는다 (R3)', () => {
  const c = load('class-spec');
  const prof = profileOf(c.profileText);
  const read = (md: string) => readMarkdown(prof, md);
  const FM = '---\ntitle: t\nversion: "1"\nauthor: a\ndate: 2026-10-15\n---\n';
  const KV = '| 항목 | 내용 |\n|---|---|\n| 패키지 | p |\n| 설명 | d |\n';

  it('제목 수준을 틀린 메서드(####)는 위반이다 (이전에는 경고뿐이고 메서드 표가 통째로 지워졌다)', () => {
    const r = read(`${FM}\n## A\n\n${KV}\n#### m1\n\n| 항목 | 내용 |\n|---|---|\n| 설명 | x |\n`);
    expect(r.violations.some((v) => v.message.includes("알 수 없는 제목: 'm1'"))).toBe(true);
  });

  it('읽는 슬롯이 없는 코드 블록은 위반, 슬롯이 없는 문단은 경고', () => {
    const r = read(
      `${FM}\n## A\n\n설명 문단입니다.\n\n${KV}\n### m1\n\n${KV.replace('패키지 | p', '설명 | q').replace('| 설명 | d |\n', '')}\n\`\`\`python\nprint(1)\n\`\`\`\n`,
    );
    expect(r.violations.map((v) => v.message).join('|')).toContain("'python' 코드 블록을 읽는 슬롯이 없음");
    expect(r.warnings.map((w) => w.message)).toContain('슬롯에 연결되지 않은 문단은 읽지 않음');
  });

  it('kv 표의 3열 이후는 위반', () => {
    const r = read(
      `${FM}\n## A\n\n| 항목 | 내용 | 비고 |\n|---|---|---|\n| 패키지 | p | 무시될 값 |\n| 설명 | d | x |\n`,
    );
    expect(r.violations.map((v) => v.message).join('|')).toContain('두 열만 쓸 수 있음');
  });

  it('표 셀의 <br>은 줄바꿈이고, 느슨한 목록 항목의 여러 문단은 줄로 이어진다', () => {
    const simple = profileOf(`${HEAD}md:
  collections:
    c:
      heading: { level: 2, pattern: '{n}' }
      slots:
        - { as: kv, key: f }
        - { as: list, key: l, under: 목록 }
bindings:
  - { kind: fields, map: { c: x } }
`);
    const r = readMarkdown(
      simple,
      '## A\n\n| 항목 | 내용 |\n|---|---|\n| 설명 | 첫줄<br>둘째줄 |\n\n### 목록\n\n- 항목 하나\n\n  이어지는 문단\n\n- 둘\n',
    );
    expect(r.violations).toEqual([]);
    const a = (r.data.c as { f: Record<string, string>; l: string[] }[])[0];
    expect(a.f.설명).toBe('첫줄\n둘째줄');
    expect(a.l[0]).toBe('항목 하나\n이어지는 문단');
  });

  it('같은 영역의 선택 슬롯이 앞에 있으면 점검이 slot-ambiguous로 거부한다(위치 기준으로 밀려 읽히는 문제)', async () => {
    const p = profileOf(`${HEAD}md:
  collections:
    c:
      heading: { level: 2, pattern: '{n}' }
      slots:
        - { as: kv, key: info, optional: true }
        - { as: records, key: rows, optional: true }
bindings:
  - { kind: fields, map: { c: x } }
`);
    const r = await testProfile(rhwpEngine, { profile: p, template: c.template, exampleMd: '' });
    expect(r.check.issues.map((i) => i.code)).toContain('slot-ambiguous');
  });
});

describe('fields 값 모델 (R4)', () => {
  const c = load('usecase');
  const run = (md: string) =>
    convertBytes(rhwpEngine, {
      profile: profileOf(c.profileText),
      mdText: md,
      template: c.template,
      dataSchema: undefined,
      skipDiagrams: true,
    });
  it('front-matter의 목록은 쉼표로 이어 넣고, 객체는 오류로 알린다', async () => {
    const list = c.md.replace('author: 홍길동', 'author: [홍길동, 김철수]');
    const { bytes } = await run(list);
    const s = await rhwpEngine.open(bytes);
    expect(s.getField('작성자')).toBe('홍길동, 김철수');
    s.dispose();
    const obj = c.md.replace('author: 홍길동', 'author:\n  name: 홍길동');
    await expect(run(obj)).rejects.toMatchObject({ issues: [expect.objectContaining({ code: 'invalid-value' })] });
  });
});
