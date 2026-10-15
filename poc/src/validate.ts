import { Ajv } from 'ajv';
import type { ErrorObject } from 'ajv';
import type { Ir } from './parse';

export interface Violation {
  line: number;
  path: string;
  message: string;
}

/** 스키마 검증용 데이터 (줄 번호 등 부가 정보 제외) */
function toData(ir: Ir) {
  return {
    meta: ir.meta,
    items: ir.items.map((i) => ({ id: i.id, name: i.name, fields: i.fields, flows: i.flows })),
  };
}

/** 오류 경로 → md 줄 번호 */
function lineOf(ir: Ir, path: string, missing?: string): number {
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'meta') return ir.metaLine;
  if (seg[0] === 'items') {
    const item = ir.items[Number(seg[1])];
    if (!item) return 1;
    if (seg[2] === 'fields') {
      const key = seg[3] ?? missing;
      return (key && item.fieldLines[key]) || item.fieldsLine;
    }
    if (seg[2] === 'flows') {
      const k = (seg[3] ?? missing) as 'main' | 'alt' | undefined;
      return k && item.flowLines[k] ? item.flowLines[k] : item.line;
    }
    return item.line;
  }
  return 1;
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

export function validateIr(ir: Ir, schema: object): Violation[] {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (validate(toData(ir))) return [];
  return (validate.errors ?? []).map((e) => {
    const missing = e.keyword === 'required' ? String((e.params as { missingProperty: string }).missingProperty) : undefined;
    return { line: lineOf(ir, e.instancePath, missing), path: e.instancePath || '/', message: describe(e) };
  });
}

export function formatViolations(file: string, vs: Violation[]): string {
  return vs.map((v) => `${file}:${v.line}  ${v.path}  ${v.message}`).join('\n');
}
