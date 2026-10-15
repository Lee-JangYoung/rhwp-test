import { readFileSync } from 'node:fs';
import type { Issue } from '@yangsik/core';

/** 종료 코드 (cli.md): 0 성공(경고 가능) · 1 입력/설정 오류 · 2 변환은 했으나 자체 검증 실패 · 3 예기치 못한 오류 · 4 --strict에서 경고 */
export const EXIT = { ok: 0, input: 1, verify: 2, internal: 3, strict: 4 } as const;

/** 여러 파일의 종료 코드를 하나로: 입력 오류 > 검증 실패 > strict 경고 > 성공 */
export const worst = (codes: number[]): number => {
  for (const c of [EXIT.internal, EXIT.input, EXIT.verify, EXIT.strict]) if (codes.includes(c)) return c;
  return EXIT.ok;
};

/** --json이면 stdout에는 JSON만 나가고 사람용 문장은 stderr로 간다 */
export class Out {
  constructor(readonly json: boolean) {}
  info(msg: string) {
    (this.json ? console.error : console.log)(msg);
  }
  err(msg: string) {
    console.error(msg);
  }
  data(value: unknown) {
    if (this.json) console.log(JSON.stringify(value, null, 2));
  }
}

export const readText = (p: string) => readFileSync(p, 'utf8');
export const readBytes = (p: string) => new Uint8Array(readFileSync(p));

export function formatIssues(file: string, issues: Issue[]): string {
  return issues
    .map(
      (i) =>
        `${file}${i.line ? `:${i.line}` : ''}  [${i.severity === 'error' ? '오류' : '경고'} ${i.code}] ${i.path || '(루트)'} — ${i.message}${
          i.candidates?.length ? ` (후보: ${i.candidates.join(', ')})` : ''
        }`,
    )
    .join('\n');
}

export class UsageError extends Error {}

/** 입력 문제(없는 파일·읽을 수 없는 파일·rhwp가 문자열로 던진 열기 실패)인지: 종료 코드 1로 다룬다 */
export function inputErrorMessage(e: unknown): string | null {
  if (e instanceof UsageError) return e.message;
  const code = (e as { code?: string } | null)?.code;
  if (typeof code === 'string' && ['ENOENT', 'EACCES', 'EISDIR', 'ENOTDIR'].includes(code))
    return `파일을 읽을 수 없음: ${(e as Error).message}`;
  if (code?.startsWith('ERR_PARSE_ARGS')) return (e as Error).message;
  if (typeof e === 'string') return `입력을 처리할 수 없음: ${e}`;
  return null;
}
