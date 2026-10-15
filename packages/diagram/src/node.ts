import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
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

/** mermaid-cli의 실행 파일(cli.js). 선택적 peer 의존성이라 없으면 설치 안내와 함께 실패한다. */
function resolveMmdc(): string {
  try {
    // 패키지 exports가 '.'만 열려 있어 진입점(src/index.js)과 같은 폴더의 cli.js를 쓴다
    return join(dirname(createRequire(import.meta.url).resolve('@mermaid-js/mermaid-cli')), 'cli.js');
  } catch {
    throw new Error('@mermaid-js/mermaid-cli가 설치돼 있지 않습니다 (Mermaid 렌더에 필요)');
  }
}

/** md의 값(항목 이름)이 파일 이름이 되므로 경로 문자를 없애고 해시를 붙인다 */
export function safeFileName(name: string): string {
  const base =
    name
      .replace(/[^\p{L}\p{N}._-]+/gu, '_')
      .replace(/^[._]+/, '')
      .slice(0, 60) || 'diagram';
  return `${base}-${createHash('sha1').update(name).digest('hex').slice(0, 8)}`;
}

/**
 * Mermaid → PNG. md의 내용을 Chromium에서 렌더하므로 두 겹으로 막는다:
 * (1) mermaid `securityLevel: strict`(HTML·링크 제거), (2) 브라우저가 어떤 네트워크 요청도 하지 못하게 프록시를 막힌 곳으로 지정(루프백 포함).
 * outDir은 이 호출만의 폴더여야 한다(같은 폴더를 동시에 쓰면 파일이 섞인다).
 */
export async function renderMermaid(source: string, outDir: string, name: string): Promise<RenderedDiagram> {
  const chromium = findChromium();
  if (!chromium) throw new Error('Chromium을 찾을 수 없습니다 (PUPPETEER_EXECUTABLE_PATH 설정 필요)');
  mkdirSync(outDir, { recursive: true });
  const file = safeFileName(name);
  const mmd = join(outDir, `${file}.mmd`);
  const png = join(outDir, `${file}.png`);
  const cfg = join(outDir, 'puppeteer.json');
  const mcfg = join(outDir, 'mermaid.json');
  writeFileSync(mmd, source);
  writeFileSync(
    cfg,
    JSON.stringify({
      executablePath: chromium,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--proxy-server=socks5://127.0.0.1:9',
        '--proxy-bypass-list=<-loopback>',
      ],
    }),
  );
  writeFileSync(mcfg, JSON.stringify({ securityLevel: 'strict' }));
  const mmdc = resolveMmdc();
  const t0 = Date.now();
  await run(process.execPath, [mmdc, '-p', cfg, '-c', mcfg, '-i', mmd, '-o', png, '-b', 'white', '-s', '2'], {
    timeout: 120_000,
  });
  const bytes = new Uint8Array(readFileSync(png));
  const { w, h } = pngSize(bytes);
  return { pngPath: png, bytes, widthPx: w, heightPx: h, ms: Date.now() - t0 };
}
