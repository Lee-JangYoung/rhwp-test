import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findChromium, renderMermaid, safeFileName } from '../src/node';

const OUT = join(fileURLToPath(new URL('../../..', import.meta.url)), 'out/test');

describe('Mermaid 임시 파일 이름 (md의 값이 경로가 되지 않는다)', () => {
  it('safeFileName은 경로 문자를 없애고 서로 다른 이름은 서로 다른 파일이 된다', () => {
    expect(safeFileName('../../../outside/pwn')).not.toMatch(/[\\/]/);
    expect(safeFileName('a/b')).not.toEqual(safeFileName('a_b'));
    expect(safeFileName('')).toMatch(/^diagram-/);
    expect(safeFileName('UC-001')).toMatch(/^UC-001-[0-9a-f]{8}$/);
  });

  it.runIf(findChromium() !== null)(
    '적대적인 이름으로도 지정한 폴더 밖에 쓰지 않는다',
    async () => {
      const dir = join(OUT, 'mm-safe');
      mkdirSync(dir, { recursive: true });
      const r = await renderMermaid('graph TD\n A-->B', dir, '../../escaped/pwn');
      expect(r.pngPath.startsWith(dir)).toBe(true);
      expect(existsSync(join(OUT, 'escaped'))).toBe(false);
    },
    120_000,
  );
});
