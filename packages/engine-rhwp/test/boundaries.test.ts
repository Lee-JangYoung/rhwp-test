import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const pkg = (dir: string) =>
  JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules') return [];
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe('패키지 경계 (ADR-0020)', () => {
  it('@rhwp/core 의존은 engine-rhwp와 웹(WASM 주소)뿐이다', () => {
    const dirs = [
      'packages/core',
      'packages/engine-rhwp',
      'packages/author',
      'apps/cli',
      'apps/mcp',
      'apps/web',
      'tools',
    ];
    const users = dirs.filter((d) => pkg(d).dependencies?.['@rhwp/core']);
    expect(users.sort()).toEqual(['apps/web', 'packages/engine-rhwp']);
  });

  it('core는 다른 @yangsik 패키지에, hwp는 engine-rhwp에 의존하지 않는다 (시험의 devDependency만 예외)', () => {
    const own = (d: string) => Object.keys(pkg(d).dependencies ?? {}).filter((n) => n.startsWith('@yangsik/'));
    expect(own('packages/core')).toEqual([]);
    expect(own('packages/hwp')).toEqual(['@yangsik/core']);
  });

  it('core 소스는 @rhwp/core를 import하지 않는다', () => {
    const offenders = sources(join(ROOT, 'packages/core/src')).filter((f) =>
      /from\s+'@rhwp\/core/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
