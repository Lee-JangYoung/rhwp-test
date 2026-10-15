// W8: 양식·md 파일 업로드, 자동 미리보기, 입력 중 규약 위반 표시, 에디터 내용 내보내기
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const TPL = new URL('../../fixtures/templates/usecase-synthetic.hwpx', import.meta.url).pathname;
const MD = new URL('../../fixtures/md/usecase-ok.md', import.meta.url).pathname;

test('W8: 업로드·자동 미리보기·내보내기', async ({ page }) => {
  await page.goto('/');
  // 양식 업로드 → 매핑 갱신
  await page.getByTestId('auto').uncheck();
  await page.getByTestId('tplfile').setInputFiles(TPL);
  await expect(page.getByTestId('template-name')).toHaveText('usecase-synthetic.hwpx');
  await expect(page.getByTestId('mapping')).toContainText('양식 라벨: UC ID', { timeout: 60_000 });
  // md 업로드 → 텍스트 반영
  await page.getByTestId('mdfile').setInputFiles(MD);
  await expect(page.getByTestId('md')).toHaveValue(/UC-001 로그인/);

  // 자동 미리보기: 켜면 변환 없이도 결과가 만들어진다 (Mermaid 제외)
  await page.getByTestId('auto').check();
  await expect(page.getByTestId('status')).toContainText('미리보기 완료', { timeout: 60_000 });
  // md를 고치면 다시 갱신 (UC 이름 변경이 매핑 패널에 나타나는지 + 재미리보기)
  const md = await page.getByTestId('md').inputValue();
  await page.getByTestId('md').fill(md.replace('로그인', '간편 로그인'));
  await expect(page.getByTestId('report')).toContainText('"items": 3', { timeout: 60_000 });
  // 입력 중 규약 위반
  await page.getByTestId('md').fill(md.replace('## UC-001', '## XX-1'));
  await expect(page.getByTestId('violations')).toContainText('input.md:8', { timeout: 60_000 });
  await page.getByTestId('md').fill(md);
  await expect(page.getByTestId('status')).toContainText('미리보기 완료', { timeout: 60_000 });

  // 에디터 내용 내보내기 (HWPX)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  await dl.saveAs('out/web-edited.hwpx');
  const bytes = readFileSync('out/web-edited.hwpx');
  console.log('EXPORT bytes:', bytes.length, 'zip:', bytes.subarray(0, 2).toString('latin1'));
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  console.log('STATUS(내보내기):', await page.getByTestId('status').textContent());
});
