// W7: 사용자가 올린 글꼴이 (a) 페이지에 등록되고 (b) Mermaid 그림에 반영되는지, (c) 에디터 로컬 글꼴 안내창 옵션이 동작하는지
import { expect, test } from '@playwright/test';

const FONT = process.env.TEST_FONT ?? '/tmp/unifont-sub.ttf';

// 변환을 한 번 돌리고, 새로 렌더된 Mermaid PNG의 SHA-256을 돌려준다
const diagramHash = async (page: import('@playwright/test').Page) => {
  await page.evaluate(() => delete (window as unknown as { __lastDiagram?: number[] }).__lastDiagram);
  await page.getByTestId('convert').click();
  await page.waitForFunction(() => (window as unknown as { __lastDiagram?: number[] }).__lastDiagram, null, {
    timeout: 120_000,
  });
  return page.evaluate(() =>
    (window as unknown as { __lastDiagram: number[] }).__lastDiagram
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  );
};

test('W7: 글꼴 동적 추가', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('auto').uncheck(); // 기존 시나리오는 수동 변환 기준
  await expect(page.getByTestId('mapping')).toBeVisible({ timeout: 60_000 });
  const before = await diagramHash(page);
  await page.getByTestId('font').setInputFiles(FONT);
  await expect(page.getByTestId('fonts')).toContainText('unifont-sub', { timeout: 30_000 });
  expect(await page.evaluate(() => document.fonts.check("16px 'unifont-sub'"))).toBe(true);
  const after = await diagramHash(page);
  console.log('Mermaid PNG SHA-256 before/after:', before.slice(0, 12), after.slice(0, 12));
  expect(after).not.toEqual(before); // 글꼴이 바뀌면 그림 픽셀이 달라진다
  // 에디터 로컬 글꼴 안내창 옵션
  await page.getByTestId('localfont').check();
  await page.getByTestId('convert').click();
  await expect(page.getByTestId('status')).toContainText(/변환 완료|에디터 로드/, { timeout: 120_000 });
  console.log('STATUS(안내창 옵션):', await page.getByTestId('status').textContent());
});
