import { Ajv, type ErrorObject } from 'ajv';
import type { Violation } from './read';

export type { Violation } from './read';

/** JSON 포인터에 가장 가까운(긴) 접두 경로의 줄 번호 */
function lineFor(lines: Map<string, number>, pointer: string, missing?: string): number {
  if (missing !== undefined) {
    const l = lines.get(`${pointer}/${missing.replace(/~/g, '~0').replace(/\//g, '~1')}`);
    if (l) return l;
  }
  let p = pointer;
  while (true) {
    const l = lines.get(p);
    if (l) return l;
    const i = p.lastIndexOf('/');
    if (i <= 0) return lines.get(p) ?? 1;
    p = p.slice(0, i);
  }
}

function describe(e: ErrorObject): string {
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case 'required':
      return `필수 항목 누락: ${String(p.missingProperty)}`;
    case 'pattern':
      return `형식 불일치 (기대: ${String(p.pattern)})`;
    case 'minItems':
      return `항목이 ${String(p.limit)}개 이상이어야 함`;
    case 'minLength':
      return '비어 있을 수 없음';
    case 'type':
      return `타입 불일치 (기대: ${String(p.type)})`;
    default:
      return e.message ?? e.keyword;
  }
}

/**
 * 규약(JSON Schema)을 읽은 데이터 트리에 적용한다. 구조 위반(readMarkdown)이 이미 있는 경로는 건너뛴다
 * (구조 검증이 먼저이고 스키마는 추가 제약, 충돌하면 구조 검증 결과가 우선).
 */
export function validateData(
  data: unknown,
  schema: object,
  lines: Map<string, number>,
  structural: Violation[] = [],
): Violation[] {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (validate(data)) return [];
  const seen = new Set(structural.map((v) => v.path));
  const out: Violation[] = [];
  for (const e of validate.errors ?? []) {
    const missing =
      e.keyword === 'required' ? String((e.params as { missingProperty: string }).missingProperty) : undefined;
    const path = e.instancePath || '/';
    const full = missing !== undefined ? `${path === '/' ? '' : path}/${missing}` : path;
    if (seen.has(path) || seen.has(full)) continue;
    out.push({ line: lineFor(lines, e.instancePath, missing), path, message: describe(e) });
  }
  return out;
}

export function formatViolations(file: string, vs: Violation[]): string {
  return vs.map((v) => `${file}:${v.line}  ${v.path}  ${v.message}`).join('\n');
}
