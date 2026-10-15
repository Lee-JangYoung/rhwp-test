import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { verifyHwp } from '../src/convert/verify';
import { convertBytes, type Profile, parseProfile } from '../src/index';
import { rhwpEngine } from '../../engine-rhwp/src/node';
import { fakeDiagram } from './util/zip';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const T = (name: string) => at(`../../../templates/${name}`);

async function convert(dir: string, withDiagram = false, formats: ('hwpx' | 'hwp')[] = ['hwpx', 'hwp']) {
  const profile = parseProfile(readFileSync(join(T(dir), 'profile.yaml'), 'utf8')).profile as Profile;
  return convertBytes(rhwpEngine, {
    profile,
    mdText: readFileSync(join(T(dir), 'example.md'), 'utf8'),
    template: new Uint8Array(readFileSync(join(T(dir), 'template.hwpx'))),
    dataSchema: existsSync(join(T(dir), 'schema.json'))
      ? (JSON.parse(readFileSync(join(T(dir), 'schema.json'), 'utf8')) as object)
      : undefined,
    skipDiagrams: !withDiagram,
    renderDiagram: withDiagram ? fakeDiagram : undefined,
    formats,
  });
}

describe('HWP 5.0 출력 (I-10)', () => {
  for (const dir of ['usecase', 'class-spec', 'db-spec', 'report']) {
    it(`${dir}: HWP가 만들어지고 자체 검증을 통과한다`, async () => {
      const r = await convert(dir);
      expect(r.hwp).toBeDefined();
      expect(r.report.hwp?.ok, JSON.stringify(r.report.hwp?.checks.filter((c) => !c.ok))).toBe(true);
      expect(r.report.verify.ok).toBe(true);
    });
  }

  it('Mermaid 그림이 있어도 HWP 그림 수가 HWPX와 같다', async () => {
    const r = await convert('usecase', true);
    expect(r.report.imagesInserted).toBeGreaterThan(0);
    expect(r.report.hwp?.ok, JSON.stringify(r.report.hwp?.checks.filter((c) => !c.ok))).toBe(true);
  });

  it('기본(formats 생략·hwpx만)은 HWP를 만들지 않고 HWPX 바이트는 같다', async () => {
    const a = await convert('usecase', false, ['hwpx']);
    expect(a.hwp).toBeUndefined();
    expect(a.report.hwp).toBeUndefined();
    const b = await convert('usecase');
    expect(Buffer.from(b.bytes).equals(Buffer.from(a.bytes))).toBe(true);
  });

  it('검증은 불일치를 잡는다: 다른 문서의 HWP, 깨진 파일', async () => {
    const a = await convert('usecase');
    const b = await convert('class-spec');
    const mismatch = await verifyHwp(rhwpEngine, b.hwp as Uint8Array, a.bytes, ['UC ID']);
    expect(mismatch.ok).toBe(false);
    expect(mismatch.checks.some((c) => !c.ok && c.name.startsWith('HWP 표'))).toBe(true);
    const broken = await verifyHwp(rhwpEngine, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), a.bytes, []);
    expect(broken.ok).toBe(false);
    expect(broken.checks[0].ok).toBe(false);
  });
});
