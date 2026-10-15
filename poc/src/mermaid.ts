import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface RenderedDiagram {
  pngPath: string;
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  ms: number;
}

/** 시스템 Chromium 경로: 환경변수 → /opt/pw-browsers 순으로 찾는다 */
export function findChromium(): string | null {
  const env = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && existsSync(env)) return env;
  const root = '/opt/pw-browsers';
  if (!existsSync(root)) return null;
  for (const d of readdirSync(root).filter((x) => x.startsWith('chromium-'))) {
    const p = join(root, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return null;
}

function pngSize(b: Uint8Array): { w: number; h: number } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

export async function renderMermaid(source: string, outDir: string, name: string): Promise<RenderedDiagram> {
  const chromium = findChromium();
  if (!chromium) throw new Error('Chromium을 찾을 수 없습니다 (PUPPETEER_EXECUTABLE_PATH 설정 필요)');
  mkdirSync(outDir, { recursive: true });
  const mmd = join(outDir, `${name}.mmd`);
  const png = join(outDir, `${name}.png`);
  const cfg = join(outDir, 'puppeteer.json');
  writeFileSync(mmd, source);
  writeFileSync(cfg, JSON.stringify({ executablePath: chromium, args: ['--no-sandbox', '--disable-setuid-sandbox'] }));
  const mmdc = fileURLToPath(new URL('../node_modules/.bin/mmdc', import.meta.url));
  const t0 = Date.now();
  await run(mmdc, ['-p', cfg, '-i', mmd, '-o', png, '-b', 'white', '-s', '2'], { timeout: 120_000 });
  const bytes = new Uint8Array(readFileSync(png));
  const { w, h } = pngSize(bytes);
  return { pngPath: png, bytes, widthPx: w, heightPx: h, ms: Date.now() - t0 };
}
