import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { convertBytes, ValidationError, type Violation } from '../src/index';
import { convert, findChromium, loadProfileFile, renderMermaid, rhwpEngine, safeFileName } from '../src/node/index';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const USECASE = join(ROOT, 'templates/usecase');
const PROFILE = join(USECASE, 'profile.yaml');
const TEMPLATE = join(USECASE, 'template.hwpx');
// 이전 파일 이름 → 새 위치 (usecase-ok → example.md, usecase-bad1/2/long → fixtures/)
const md = (n: string) =>
  join(USECASE, n === 'usecase-ok.md' ? 'example.md' : join('fixtures', n.replace('usecase-', '')));
const OUT = join(ROOT, 'out/test');
mkdirSync(OUT, { recursive: true });

const opts = (mdName: string, out: string, extra: object = {}) => ({
  mdPath: md(mdName),
  profilePath: PROFILE,
  outPath: join(OUT, out),
  workDir: join(OUT, 'work'),
  ...extra,
});

/** md의 규약 위반 목록(위반이 없으면 빈 배열) */
async function violationsOf(mdName: string): Promise<Violation[]> {
  const l = loadProfileFile(PROFILE);
  try {
    await convertBytes(rhwpEngine, {
      profile: l.profile as NonNullable<typeof l.profile>,
      mdText: readFileSync(md(mdName), 'utf8'),
      template: new Uint8Array(readFileSync(TEMPLATE)),
      dataSchema: JSON.parse(readFileSync(l.schemaPath as string, 'utf8')) as object,
      skipDiagrams: true,
    });
    return [];
  } catch (e) {
    if (e instanceof ValidationError) return e.violations;
    throw e;
  }
}

describe('P1 md 읽기·규약 검증', () => {
  it('정상 문서는 위반이 없다', async () => {
    expect(await violationsOf('usecase-ok.md')).toEqual([]);
  });

  it('위반 1: ID 형식과 필수 항목 누락을 줄 번호와 함께 알려준다', async () => {
    const vs = await violationsOf('usecase-bad1.md');
    expect(vs.map((v) => [v.line, v.path, v.message])).toEqual([
      [8, '/items/0/id', expect.stringContaining('형식 불일치')],
      [10, '/items/0/fields', '필수 항목 누락: 사후조건'],
    ]);
  });

  it('위반 2: front-matter 누락·형식, 필수 슬롯(기본 흐름) 누락', async () => {
    const vs = await violationsOf('usecase-bad2.md');
    const msgs = vs.map((v) => v.message).join('|');
    expect(msgs).toContain('필수 항목 누락: author');
    expect(msgs).toContain('형식 불일치');
    // 구조 검증(프로필의 md 규칙)이 먼저: 기본 흐름이 없음 → 항목 제목 줄(7)
    expect(
      vs.some((v) => v.path === '/items/0/main' && v.line === 7 && v.message.startsWith('필수 항목 누락: main')),
    ).toBe(true);
  });

  it('위반 문서는 변환을 거부한다', async () => {
    await expect(
      convert(rhwpEngine, opts('usecase-bad1.md', 'bad.hwpx', { skipMermaid: true })),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('P2·P3·P5 필드 채움, 반복 블록, 저장 검증', () => {
  it('UC 3건을 표 단위 복제로 만들고 복제본마다 다른 값을 채운다', async () => {
    const r = await convert(rhwpEngine, opts('usecase-ok.md', 'ok.hwpx', { skipMermaid: true }));
    expect(r.cloned).toBe(2);
    expect(r.fieldsSet).toEqual({ 문서명: true, 버전: true, 작성자: true, 작성일: true });
    expect(r.verify.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.verify.ok).toBe(true);
  });

  it('저장 파일을 다시 열어도 블록별 값이 서로 섞이지 않는다', async () => {
    await convert(rhwpEngine, opts('usecase-ok.md', 'ok2.hwpx', { skipMermaid: true }));
    const s = await rhwpEngine.open(new Uint8Array(readFileSync(join(OUT, 'ok2.hwpx'))));
    const ids = s.topTables().map((t) => s.tableCells(t).find((c) => c.row === 0 && c.col === 1)?.text);
    expect(ids).toEqual(['UC-001', 'UC-002', 'UC-003']);
    s.dispose();
  });

  it('표는 쪽 경계에서 나눔(cell)으로 저장되고, 긴 표는 다음 쪽에 이어진다 (떠 있는 표 양식)', async () => {
    const r = await convert(rhwpEngine, opts('usecase-long.md', 'long.hwpx', { skipMermaid: true }));
    expect(r.verify.ok).toBe(true);
    expect(r.pages).toBeGreaterThanOrEqual(2);
    const s = await rhwpEngine.open(new Uint8Array(readFileSync(join(OUT, 'long.hwpx'))));
    expect(s.tableLayouts().every((l) => l.pageBreak === 'cell')).toBe(true);
    expect(s.pageCount()).toBeGreaterThanOrEqual(2);
    s.dispose();
  });

  it('알려진 제약: 글자처럼 취급인 표는 rhwp 조판에서 쪽을 넘겨도 나뉘지 않는다', async () => {
    mkdirSync(join(OUT, 'tpl'), { recursive: true });
    const { execFileSync } = await import('node:child_process');
    const inline = join(OUT, 'tpl/inline.hwpx');
    execFileSync('npx', ['tsx', 'scripts/make-template.ts', inline], {
      cwd: join(ROOT, 'packages/core'),
      env: { ...process.env, TABLE_INLINE: '1' },
    });
    const l = loadProfileFile(PROFILE);
    const { report: r } = await convertBytes(rhwpEngine, {
      profile: l.profile as NonNullable<typeof l.profile>,
      mdText: readFileSync(md('usecase-long.md'), 'utf8'),
      template: new Uint8Array(readFileSync(inline)),
      dataSchema: JSON.parse(readFileSync(l.schemaPath as string, 'utf8')) as object,
      skipDiagrams: true,
    });
    expect(r.pages).toBe(1); // 긴 표가 한 쪽에 넘쳐 그려진다 (떠 있는 표는 3쪽으로 이어짐)
  });

  it('표 높이 맞춤을 끄면 자체 검증이 낡은 높이를 잡는다', async () => {
    const r = await convert(
      rhwpEngine,
      opts('usecase-ok.md', 'stale.hwpx', { skipMermaid: true, output: { fitHeights: false } }),
    );
    const c = r.verify.checks.find((x) => x.name.startsWith('표 저장 높이'));
    expect(c?.ok).toBe(false);
  });
});

describe.runIf(findChromium() !== null)('P4 Mermaid → 그림', () => {
  it('다이어그램을 PNG로 렌더해 글자처럼 취급하는 그림으로 넣는다', async () => {
    const r = await convert(rhwpEngine, opts('usecase-ok.md', 'mermaid.hwpx'));
    expect(r.imagesInserted).toBe(1);
    expect(r.diagrams[0].widthPx).toBeGreaterThan(100);
    expect(r.verify.checks.find((c) => c.name.startsWith('그림이 글자처럼'))?.ok).toBe(true);
    expect(r.verify.ok).toBe(true);
    expect(existsSync(join(OUT, 'mermaid.hwpx'))).toBe(true);
  }, 120_000);
});

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
