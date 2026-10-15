// W9: 문서 유형 전환(클래스 명세서), 프로필 직접 올리기와 점검 결과 표시
// 올릴 파일은 ASCII 경로(임시 폴더)에 둔다: 시험 출력 폴더의 한글 경로에서는 setInputFiles가 파일을 못 읽었다.
import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('W9: 문서 유형 전환·변환·프로필 점검', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByTestId('auto').uncheck();
  await expect(page.getByTestId('mapping')).toContainText('양식 라벨: UC ID', { timeout: 60_000 });

  // 클래스 명세서로 전환: 양식·예제 md·프로필이 바뀌고 변환된다
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: /class-spec/ }).click();
  await expect(page.getByTestId('template-name')).toContainText('class-spec/template.hwpx');
  await expect(page.getByTestId('md')).toHaveValue(/## Member/);
  await page.getByTestId('convert').click();
  await expect(page.getByTestId('report')).toContainText('"items": 4', { timeout: 120_000 });
  await expect(page.getByTestId('status')).toContainText('자체 검증 통과');
  await page.screenshot({ path: testInfo.outputPath('class-spec.png'), fullPage: true });

  // 틀린 프로필을 올리면 점검 오류가 코드·후보와 함께 보인다
  const bad = `version: 1
type: usecase
template: template.hwpx
md:
  collections:
    items:
      heading: { level: 2, pattern: '{id} {name}' }
bindings:
  - kind: repeat
    over: items
    unit: { table: { label: 없는라벨 } }
    do:
      - { kind: cells, map: { 'UC ID': '{id}' } }
`;
  const file = join(mkdtempSync(join(tmpdir(), 'yangsik-w9-')), 'bad-profile.yaml');
  writeFileSync(file, bad);
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: /usecase/ }).click();
  await expect(page.getByTestId('mapping')).toContainText('양식 라벨: UC ID', { timeout: 60_000 });
  await page.getByTestId('profilefile').setInputFiles(file);
  await expect(page.getByTestId('profile-note')).toContainText('bad-profile.yaml');
  await page.getByText('프로필 점검').click();
  await expect(page.getByTestId('profile-issues')).toContainText('table-not-found', { timeout: 60_000 });
});
