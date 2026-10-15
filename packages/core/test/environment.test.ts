import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe('환경 독립 (ADR-0011)', () => {
  // node/ 밖의 코어 파일은 Node·브라우저 어디서나 돌아야 한다
  const neutral = files(SRC).filter((f) => !relative(SRC, f).startsWith('node'));

  it('node/ 밖 파일은 Node API를 쓰지 않는다', () => {
    const offenders = neutral.filter((f) =>
      /from\s+['"]node:|\bBuffer\b|\bprocess\.|\brequire\(|__dirname|import\.meta\.url/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });

  it('공개 API는 합의한 범위만 노출한다', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'ValidationError',
        'convertBytes',
        'createRhwpEngine',
        'formatViolations',
        'parseMarkdown',
        'previewMapping',
        'validateIr',
      ].sort(),
    );
  });
});
