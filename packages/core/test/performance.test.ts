// 성능 회귀 방지 (S-28). 수정 전에는 유스케이스 100항목이 약 57초 걸렸다(편집마다 전체 조판을 다시 계산).
// 시간 기준은 느린 CI에서도 흔들리지 않도록 넉넉하게 잡았다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { convertBytes, parseProfile } from '../src/index';
import { rhwpEngine } from '../../engine-rhwp/src/node';

const dir = (n: string) => fileURLToPath(new URL(`../../../templates/${n}`, import.meta.url));
const load = (n: string) => ({
  profile: parseProfile(readFileSync(`${dir(n)}/profile.yaml`, 'utf8')).profile as NonNullable<
    ReturnType<typeof parseProfile>['profile']
  >,
  template: new Uint8Array(readFileSync(`${dir(n)}/template.hwpx`)),
  schema: JSON.parse(readFileSync(`${dir(n)}/schema.json`, 'utf8')) as object,
});
const FM = '---\ntitle: 벤치\nversion: "1"\nauthor: a\ndate: 2026-10-15\n---\n';

describe('큰 문서 변환 시간', () => {
  it('유스케이스 100항목(표 100개, 23쪽)이 20초 안에 끝나고 자체 검증을 통과한다', async () => {
    const c = load('usecase');
    const md =
      FM +
      Array.from(
        { length: 100 },
        (_, i) =>
          `\n## UC-${String(i + 1).padStart(3, '0')} 항목${i}\n\n| 항목 | 내용 |\n|---|---|\n| 액터 | 회원 |\n| 사전조건 | 없음 |\n| 사후조건 | 완료 |\n\n### 기본 흐름\n\n1. 하나\n2. 둘\n3. 셋\n`,
      ).join('');
    const t0 = Date.now();
    const { report } = await convertBytes(rhwpEngine, {
      profile: c.profile,
      mdText: md,
      template: c.template,
      dataSchema: c.schema,
      skipDiagrams: true,
    });
    const ms = Date.now() - t0;
    expect(report.verify.checks.filter((x) => !x.ok)).toEqual([]);
    expect(report.items).toBe(100);
    expect(ms).toBeLessThan(20_000);
  }, 60_000);

  it('DB 명세서 20테이블 × 20컬럼(행 복제 400행)이 20초 안에 끝난다', async () => {
    const c = load('db-spec');
    const md =
      FM +
      Array.from(
        { length: 20 },
        (_, i) =>
          `\n## TB${i}\n\n| 항목 | 내용 |\n|---|---|\n| 설명 | 테이블 |\n\n### 컬럼\n\n| 컬럼명 | 타입 | 길이 | NULL | 설명 |\n|---|---|---|---|---|\n${Array.from({ length: 20 }, (_, k) => `| C${k} | VARCHAR | 10 | N | 컬럼 |`).join('\n')}\n`,
      ).join('');
    const t0 = Date.now();
    const { report } = await convertBytes(rhwpEngine, {
      profile: c.profile,
      mdText: md,
      template: c.template,
      dataSchema: c.schema,
      skipDiagrams: true,
    });
    expect(report.verify.checks.filter((x) => !x.ok)).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(20_000);
  }, 60_000);
});
