import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

/** ZIP(HWPX) 항목별 SHA-256. 중앙 디렉터리를 읽는 최소 구현(시험 전용). */
export function zipEntryHashes(bytes: Uint8Array): Record<string, string> {
  const b = Buffer.from(bytes);
  let eocd = b.length - 22;
  while (eocd >= 0 && b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = b.readUInt16LE(eocd + 10);
  let off = b.readUInt32LE(eocd + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const method = b.readUInt16LE(off + 10);
    const csize = b.readUInt32LE(off + 20);
    const nameLen = b.readUInt16LE(off + 28);
    const extraLen = b.readUInt16LE(off + 30);
    const commentLen = b.readUInt16LE(off + 32);
    const local = b.readUInt32LE(off + 42);
    const name = b.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    const lNameLen = b.readUInt16LE(local + 26);
    const lExtraLen = b.readUInt16LE(local + 28);
    const data = b.subarray(local + 30 + lNameLen + lExtraLen, local + 30 + lNameLen + lExtraLen + csize);
    const raw = method === 0 ? data : inflateRawSync(data);
    out[name] = createHash('sha256').update(raw).digest('hex');
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** 결정적인 가짜 다이어그램(Chromium 비의존). 그림 삽입 경로를 골든에 포함시키기 위한 것 */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
export const fakeDiagram = async () => ({ bytes: new Uint8Array(PNG_1x1), widthPx: 900, heightPx: 610, ms: 0 });
