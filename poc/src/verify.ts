import { readBlock } from './blocks';
import type { DocumentEngine, PageBreakMode } from './engine/types';

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface Expected {
  /** 누름틀 이름 → 값 */
  fields: Record<string, string>;
  /** 반복 블록별 "라벨 → 값" (표 순서대로) */
  blocks: Record<string, string>[];
  /** 본문에 들어간 그림 수 */
  images: number;
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
  const name = Buffer.from(bytes.subarray(30, 30 + nameLen)).toString('utf8');
  const ok = sig && method === 0 && name === 'mimetype';
  return { name: 'ZIP: 첫 항목이 무압축 mimetype', ok, detail: ok ? undefined : `sig=${sig} method=${method} name=${name}` };
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
      checks.push({ name: `필드 "${name}" 값 유지`, ok: got === want, detail: got === want ? undefined : `기대 "${want}" / 실제 "${got}"` });
    }

    // 2) 반복 블록 수와 셀 값
    const tables = s.topTables();
    checks.push({ name: '반복 블록(표) 수', ok: tables.length === exp.blocks.length, detail: `기대 ${exp.blocks.length} / 실제 ${tables.length}` });
    exp.blocks.forEach((want, i) => {
      const t = tables[i];
      if (!t) return;
      const got = readBlock(s, t);
      for (const [label, v] of Object.entries(want)) {
        checks.push({
          name: `블록 ${i + 1} "${label}" 값`,
          ok: got[label] === v,
          detail: got[label] === v ? undefined : `기대 ${JSON.stringify(v)} / 실제 ${JSON.stringify(got[label])}`,
        });
      }
    });

    // 3) 그림 수
    checks.push({ name: '그림 컨트롤 수', ok: (counts.gso ?? 0) === exp.images, detail: `기대 ${exp.images} / 실제 ${counts.gso ?? 0}` });

    // 2-1) 표 쪽 나눔: 나누지 않음이면 쪽을 넘는 표가 다음 쪽으로 이어지지 않고 잘린다
    const tl = s.tableLayouts();
    const badSplit = tl.filter((l) => l.pageBreak !== exp.tableSplit).length;
    checks.push({ name: `표 쪽 나눔 = ${exp.tableSplit}`, ok: badSplit === 0, detail: badSplit ? `${badSplit}개 표가 다른 값` : undefined });

    // 2-2) 표 저장 높이: 렌더 높이보다 작으면 뒤따르는 문단·그림이 표를 가린다 (한 쪽 안의 표만 비교)
    const stale = tl.filter((l) => l.renderedHeightHu !== null && l.storedHeightHu < l.renderedHeightHu * 0.98).length;
    checks.push({ name: '표 저장 높이가 렌더 높이 이상', ok: stale === 0, detail: stale ? `${stale}개 표가 낡은 높이` : undefined });

    // 3-1) 그림 배치: 떠 있는 개체(treatAsChar=false)는 용지 기준으로 놓여 표를 덮는다 (미리보기에서 발견된 문제)
    const layouts = s.pictureLayouts();
    const floating = layouts.filter((l) => !l.treatAsChar).length;
    checks.push({ name: '그림이 글자처럼 취급(문단 안 배치)', ok: floating === 0, detail: floating ? `떠 있는 그림 ${floating}개` : undefined });

    // 4) 저장 전후 컨트롤 종류별 개수 (손실 보고가 놓친 사례가 있어 직접 비교)
    const kinds = new Set([...Object.keys(counts), ...Object.keys(exp.preExportCounts)]);
    const diff = [...kinds].filter((k) => (counts[k] ?? 0) !== (exp.preExportCounts[k] ?? 0));
    checks.push({
      name: '저장 전후 컨트롤 종류별 개수 동일',
      ok: diff.length === 0,
      detail: diff.map((k) => `${k}: ${exp.preExportCounts[k] ?? 0}→${counts[k] ?? 0}`).join(', ') || undefined,
    });

    // 5) 비표준 파일 (정보용)
    const nonStandardEntry = Buffer.from(bytes).includes('rhwp-hwp5-origin');
    return { ok: checks.every((c) => c.ok), checks, pages: s.pageCount(), controlCounts: counts, nonStandardEntry };
  } finally {
    s.dispose();
  }
}
