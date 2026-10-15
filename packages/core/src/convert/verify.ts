import type { DocumentEngine, DocumentSession, PageBreakMode } from '../engine/types';
import { type LabelOptions, readBlock } from './blocks';

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface Expected {
  /** 누름틀 이름 → 값 */
  fields: Record<string, string>;
  /** 값을 채운 표별 "라벨 → 값". table은 본문 표 순서(0부터) */
  blocks: { table: number; values: Record<string, string>; labels?: LabelOptions }[];
  /** 치환한 토큰({{이름}}). 저장 후 남아 있으면 안 된다 */
  tokens?: string[];
  /** `paragraphs`로 만든 문단들(줄 목록). 저장 후 본문에 이어서 있어야 한다 */
  paragraphs?: string[][];
  /** `rows`로 채운 행 목록의 셀 값. table은 본문 표 순서 */
  lists?: { table: number; cells: { row: number; col: number; text: string }[] }[];
  /** 저장 직전 본문 표별 행 수(rows·remove를 쓴 경우만). 재로드 결과와 비교 */
  rowCounts?: number[];
  /** 저장 후 본문 표의 총 개수 */
  tableCount: number;
  /** 쪽 나눔 설정을 기대하는 표(본문 표 순서) */
  splitTables: number[];
  /** 이번 변환이 본문에 넣은 그림 수 */
  images: number;
  /** 양식에 원래 있던 그림 컨트롤 수(gso)와 떠 있는 그림 수 */
  baseImages: number;
  baseFloating: number;
  /** 반복 블록 표에 기대하는 쪽 나눔 설정 */
  tableSplit: PageBreakMode;
  /** 저장 직전 세션의 컨트롤 종류별 개수 (재로드 결과와 비교) */
  preExportCounts: Record<string, number>;
}

export interface VerifyReport {
  ok: boolean;
  checks: Check[];
  pages: number;
  controlCounts: Record<string, number>;
  nonStandardEntry: boolean;
}

/** HWPX(ZIP) 컨테이너 기본 점검: 첫 항목이 무압축 mimetype이어야 한다 */
export function checkZipHeader(bytes: Uint8Array): Check {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = dv.getUint32(0, true) === 0x04034b50;
  const method = dv.getUint16(8, true);
  const nameLen = dv.getUint16(26, true);
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLen));
  const ok = sig && method === 0 && name === 'mimetype';
  return {
    name: 'ZIP: 첫 항목이 무압축 mimetype',
    ok,
    detail: ok ? undefined : `sig=${sig} method=${method} name=${name}`,
  };
}

export async function verifyOutput(engine: DocumentEngine, bytes: Uint8Array, exp: Expected): Promise<VerifyReport> {
  const checks: Check[] = [checkZipHeader(bytes)];
  const s = await engine.open(bytes);
  try {
    const counts = s.controlCounts();
    checks.push({ name: '재로드 성공', ok: true });

    // 1) 누름틀 값
    for (const [name, want] of Object.entries(exp.fields)) {
      const got = s.getField(name);
      checks.push({
        name: `필드 "${name}" 값 유지`,
        ok: got === want,
        detail: got === want ? undefined : `기대 "${want}" / 실제 "${got}"`,
      });
    }

    // 2) 반복 블록 수와 셀 값
    const tables = s.topTables();
    checks.push({
      name: '반복 블록(표) 수',
      ok: tables.length === exp.tableCount,
      detail: `기대 ${exp.tableCount} / 실제 ${tables.length}`,
    });
    exp.blocks.forEach(({ table, values: want, labels }, i) => {
      const t = tables[table];
      if (!t) return;
      const got = readBlock(s, t, labels);
      for (const [label, v] of Object.entries(want)) {
        checks.push({
          name: `블록 ${i + 1} "${label}" 값`,
          ok: got[label] === v,
          detail: got[label] === v ? undefined : `기대 ${JSON.stringify(v)} / 실제 ${JSON.stringify(got[label])}`,
        });
      }
    });

    // 2-4) 치환 토큰(text), 문단(paragraphs)
    if (exp.tokens?.length) {
      const text = s.bodyText();
      const left = exp.tokens.filter((t) => text.includes(t));
      checks.push({
        name: '치환한 토큰이 남지 않음',
        ok: left.length === 0,
        detail: left.length ? left.join(', ') : undefined,
      });
    }
    if (exp.paragraphs?.length) {
      const body = s.bodyParagraphs();
      const hasRun = (lines: string[]) => body.some((_, i) => lines.every((l, k) => body[i + k] === l));
      const bad = exp.paragraphs.filter((l) => !hasRun(l));
      checks.push({
        name: '문단 목록이 본문에 이어서 있음',
        ok: bad.length === 0,
        detail: bad.length ? `${bad.length}개 목록이 없음, 예: ${JSON.stringify(bad[0].slice(0, 2))}` : undefined,
      });
    }

    // 2-3) 행 목록(rows) 셀 값, 표별 행 수
    for (const { table, cells: want } of exp.lists ?? []) {
      const t = tables[table];
      if (!t) continue;
      const got = new Map(s.tableCells(t).map((c) => [`${c.row},${c.col}`, c.text]));
      const bad = want.filter((w) => got.get(`${w.row},${w.col}`) !== w.text);
      checks.push({
        name: `표 ${table + 1} 행 목록 값`,
        ok: bad.length === 0,
        detail: bad.length
          ? `${bad.length}칸 불일치, 예: (${bad[0].row},${bad[0].col}) 기대 ${JSON.stringify(bad[0].text)} / 실제 ${JSON.stringify(got.get(`${bad[0].row},${bad[0].col}`))}`
          : undefined,
      });
    }
    if (exp.rowCounts) {
      const now = s.analyze().tables.map((t) => t.rows);
      const same = now.length === exp.rowCounts.length && now.every((n, i) => n === exp.rowCounts?.[i]);
      checks.push({
        name: '표별 행 수 저장 전후 동일',
        ok: same,
        detail: same ? undefined : `저장 전 ${JSON.stringify(exp.rowCounts)} / 재로드 ${JSON.stringify(now)}`,
      });
    }

    // 3) 그림 수
    checks.push({
      name: '그림 컨트롤 수',
      ok: (counts.gso ?? 0) === exp.baseImages + exp.images,
      detail: `기대 ${exp.baseImages + exp.images} (양식 ${exp.baseImages} + 삽입 ${exp.images}) / 실제 ${counts.gso ?? 0}`,
    });

    // 2-1) 표 쪽 나눔: 나누지 않음이면 쪽을 넘는 표가 다음 쪽으로 이어지지 않고 잘린다
    const tl = s.tableLayouts();
    const badSplit = exp.splitTables.filter((i) => tl[i]?.pageBreak !== exp.tableSplit).length;
    checks.push({
      name: `표 쪽 나눔 = ${exp.tableSplit}`,
      ok: badSplit === 0,
      detail: badSplit ? `${badSplit}개 표가 다른 값` : undefined,
    });

    // 2-2) 표 저장 높이: 렌더 높이보다 작으면 뒤따르는 문단·그림이 표를 가린다 (한 쪽 안의 표만 비교)
    const stale = tl.filter((l) => l.renderedHeightHu !== null && l.storedHeightHu < l.renderedHeightHu * 0.98).length;
    checks.push({
      name: '표 저장 높이가 렌더 높이 이상',
      ok: stale === 0,
      detail: stale ? `${stale}개 표가 낡은 높이` : undefined,
    });

    // 3-1) 그림 배치: 떠 있는 개체(treatAsChar=false)는 용지 기준으로 놓여 표를 덮는다 (미리보기에서 발견된 문제)
    const layouts = s.pictureLayouts();
    const floating = layouts.filter((l) => !l.treatAsChar).length;
    checks.push({
      name: '그림이 글자처럼 취급(문단 안 배치)',
      ok: floating <= exp.baseFloating,
      detail: floating > exp.baseFloating ? `새로 떠 있는 그림 ${floating - exp.baseFloating}개` : undefined,
    });

    // 4) 저장 전후 컨트롤 종류별 개수 (손실 보고가 놓친 사례가 있어 직접 비교)
    const kinds = new Set([...Object.keys(counts), ...Object.keys(exp.preExportCounts)]);
    const diff = [...kinds].filter((k) => (counts[k] ?? 0) !== (exp.preExportCounts[k] ?? 0));
    checks.push({
      name: '저장 전후 컨트롤 종류별 개수 동일',
      ok: diff.length === 0,
      detail: diff.map((k) => `${k}: ${exp.preExportCounts[k] ?? 0}→${counts[k] ?? 0}`).join(', ') || undefined,
    });

    // 5) 비표준 파일 (정보용)
    const nonStandardEntry = new TextDecoder('latin1').decode(bytes).includes('rhwp-hwp5-origin');
    return { ok: checks.every((c) => c.ok), checks, pages: s.pageCount(), controlCounts: counts, nonStandardEntry };
  } finally {
    s.dispose();
  }
}

/** HWPX와 HWP 5.0이 같은 내용이어야 하는 항목을 뽑은 요약 */
interface Snapshot {
  pages: number;
  fields: Record<string, string | null>;
  tables: string[][];
  gso: number;
}

function snapshot(s: DocumentSession, fieldNames: string[]): Snapshot {
  return {
    pages: s.pageCount(),
    fields: Object.fromEntries(
      fieldNames.map((n) => {
        try {
          return [n, s.getField(n)];
        } catch {
          return [n, null]; // 필드가 없으면 엔진이 던진다
        }
      }),
    ),
    tables: s.topTables().map((t) =>
      s
        .tableCells(t)
        .map((c) => `${c.row},${c.col}:${c.text}`)
        .sort(),
    ),
    gso: s.controlCounts().gso ?? 0,
  };
}

/** HWP 5.0 바이트 점검: CFB 서명(D0 CF 11 E0 A1 B1 1A E1) */
export function checkCfbHeader(bytes: Uint8Array): Check {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const ok = bytes.length >= 8 && sig.every((b, i) => bytes[i] === b);
  return { name: 'HWP: CFB 서명', ok, detail: ok ? undefined : '파일이 HWP 5.0(CFB)이 아님' };
}

export interface HwpVerifyReport {
  /** 내용(표·셀 텍스트·누름틀·그림)이 HWPX와 같은가. 쪽 수 차이는 notes로만 알린다 */
  ok: boolean;
  checks: Check[];
  /** 막지는 않지만 알아야 할 차이(조판 차이로 쪽 수가 다름 등) */
  notes: string[];
  bytes: number;
}

/** 저장한 HWP를 다시 열어 같은 내용의 HWPX 재로드 결과와 비교한다 */
export async function verifyHwp(
  engine: DocumentEngine,
  hwp: Uint8Array,
  hwpx: Uint8Array,
  fieldNames: string[],
): Promise<HwpVerifyReport> {
  const checks: Check[] = [checkCfbHeader(hwp)];
  let ref: Snapshot | null = null;
  const a = await engine.open(hwpx);
  try {
    ref = snapshot(a, fieldNames);
  } finally {
    a.dispose();
  }
  let got: Snapshot;
  try {
    const b = await engine.open(hwp);
    try {
      got = snapshot(b, fieldNames);
    } finally {
      b.dispose();
    }
  } catch (e) {
    checks.push({ name: 'HWP 재로드 성공', ok: false, detail: (e as Error).message });
    return { ok: false, checks, notes: [], bytes: hwp.length };
  }
  checks.push({ name: 'HWP 재로드 성공', ok: true });
  // 쪽 수는 엔진 조판 차이일 수 있어(예: 글자처럼 취급 표, L-23) 내용 검증과 따로 알리기만 한다
  const notes =
    got.pages === ref.pages
      ? []
      : [`rhwp 조판 기준 쪽 수가 다름: HWPX ${ref.pages}쪽 / HWP ${got.pages}쪽 (내용은 같음)`];
  checks.push({
    name: 'HWP 표 수 = HWPX',
    ok: got.tables.length === ref.tables.length,
    detail:
      got.tables.length === ref.tables.length ? undefined : `HWPX ${ref.tables.length} / HWP ${got.tables.length}`,
  });
  const badTables = ref.tables
    .map((t, i) => (JSON.stringify(t) === JSON.stringify(got.tables[i]) ? -1 : i + 1))
    .filter((i) => i > 0);
  checks.push({
    name: 'HWP 표별 셀 텍스트 = HWPX',
    ok: badTables.length === 0,
    detail: badTables.length ? `표 ${badTables.slice(0, 5).join(', ')} 불일치` : undefined,
  });
  const badFields = fieldNames.filter((n) => got.fields[n] !== ref?.fields[n]);
  checks.push({
    name: 'HWP 누름틀 값 = HWPX',
    ok: badFields.length === 0,
    detail: badFields.length ? badFields.slice(0, 5).join(', ') : undefined,
  });
  checks.push({
    name: 'HWP 그림 수 = HWPX',
    ok: got.gso === ref.gso,
    detail: got.gso === ref.gso ? undefined : `HWPX ${ref.gso} / HWP ${got.gso}`,
  });
  return { ok: checks.every((c) => c.ok), checks, notes, bytes: hwp.length };
}
