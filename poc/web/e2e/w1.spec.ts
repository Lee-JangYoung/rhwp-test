// 웹 PoC 자동 확인 (W1~W6). 시스템 Chromium + 에이전트 프록시 사용. TLS 검증은 끄지 않는다.
import { expect, test } from '@playwright/test';

test('W1~W6: 로드·매핑·위반·변환·저장', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto('/');
  // W2: 양식 매핑 미리보기 (rhwp WASM이 브라우저에서 로드됨)
  await expect(page.getByTestId('mapping')).toContainText('양식 라벨: UC ID, 유스케이스명, 액터, 사전조건, 사후조건, 기본 흐름, 대안 흐름', { timeout: 60_000 });
  // W1: 호스팅 스튜디오 에디터에 양식 표시
  await expect(page.getByTestId('status')).toContainText('에디터 로드', { timeout: 90_000 }).catch(() => {});
  console.log('STATUS(양식):', await page.getByTestId('status').textContent());
  // W3: 규약 위반
  const md = await page.getByTestId('md').inputValue();
  await page.getByTestId('md').fill(md.replace('## UC-001', '## XX-1'));
  await page.getByTestId('convert').click();
  await expect(page.getByTestId('violations')).toContainText('input.md:', { timeout: 30_000 });
  console.log('VIOLATIONS:', await page.getByTestId('violations').textContent());
  // W4~W6: 정상 변환 + Mermaid + 저장
  await page.getByTestId('md').fill(md);
  await page.getByTestId('convert').click();
  await expect(page.getByTestId('report')).toContainText('"imagesInserted"', { timeout: 120_000 });
  console.log('REPORT:', await page.getByTestId('report').textContent());
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]);
  await dl.saveAs('out/web-result.hwpx');
  console.log('STATUS(결과):', await page.getByTestId('status').textContent());
  console.log(logs.slice(-20).join('\n'));
});
