import { Ajv, type ErrorObject } from 'ajv';
import { LineCounter, type Node, parseDocument } from 'yaml';
import { closest, type Issue, type IssueCode } from './issues';
import { KINDS } from './kinds';
import { buildProfileSchema } from './schema';
import type { Profile } from './types';

export interface ParseResult {
  /** 스키마를 통과했을 때만 값이 있다 (기본값이 채워진 상태) */
  profile?: Profile;
  issues: Issue[];
  /** 프로필 경로(예: bindings[1].do[0].map)의 줄 번호. 점검 결과에 줄 번호를 붙일 때 쓴다 */
  lineOf?: (path: string) => number | undefined;
}

let validator: ReturnType<Ajv['compile']> | undefined;
let validatorKinds = -1;
function getValidator() {
  // kind가 등록되면(KINDS 길이가 바뀌면) 스키마를 다시 만든다
  if (!validator || validatorKinds !== KINDS.length) {
    validatorKinds = KINDS.length;
    const ajv = new Ajv({ allErrors: true, strict: false, verbose: true, discriminator: true });
    validator = ajv.compile(buildProfileSchema());
  }
  return validator;
}

const toPath = (segs: (string | number)[]): string =>
  segs.reduce<string>((acc, s) => (typeof s === 'number' ? `${acc}[${s}]` : acc ? `${acc}.${s}` : s), '');

export const pathToSegs = (path: string): (string | number)[] =>
  [...path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((m) => (m[2] !== undefined ? Number(m[2]) : m[1]));

const decode = (p: string): string[] =>
  p
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));

/** 스키마·값 오류를 구조화된 항목으로 바꾼다. */
function toIssues(
  errors: ErrorObject[],
  root: unknown,
  lineOf: (segs: (string | number)[]) => number | undefined,
): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  for (const e of errors) {
    let segs: (string | number)[] = decode(e.instancePath).map((s) => (/^\d+$/.test(s) ? Number(s) : s));
    const p = e.params as Record<string, unknown>;
    let code: IssueCode = 'invalid-value';
    let message = e.message ?? e.keyword;
    let candidates: string[] | undefined;
    let expected: unknown;
    const schemaProps = Object.keys(
      ((e.parentSchema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {}) as object,
    );
    switch (e.keyword) {
      case 'additionalProperties': {
        const bad = String(p.additionalProperty);
        code = 'unknown-key';
        segs = [...segs, bad];
        message = `알 수 없는 키: ${bad}`;
        candidates = closest(bad, schemaProps, 4);
        break;
      }
      case 'required':
        code = 'missing-key';
        message = `필수 키 누락: ${String(p.missingProperty)}`;
        expected = p.missingProperty;
        break;
      case 'type':
        code = 'invalid-type';
        expected = p.type;
        message = `값의 종류가 다름 (기대: ${String(p.type)})`;
        break;
      case 'enum':
        code = 'invalid-value';
        candidates = (p.allowedValues as unknown[]).map(String);
        message = `허용되지 않는 값 (허용: ${candidates.join(', ')})`;
        break;
      case 'const':
        expected = p.allowedValue;
        message = `값이 ${JSON.stringify(p.allowedValue)}이어야 한다`;
        break;
      case 'discriminator': {
        if (p.error === 'tag') {
          code = 'missing-key';
          segs = [...segs, 'kind'];
          message = '필수 키 누락: kind';
        } else {
          const bad = String((e.data as { kind?: unknown } | undefined)?.kind ?? '');
          code = 'unknown-kind';
          segs = [...segs, 'kind'];
          candidates = closest(
            bad,
            KINDS.map((k) => k.name),
            8,
          );
          message = `등록되지 않은 kind: ${bad}`;
        }
        break;
      }
      case 'oneOf':
        // 값 표기(valueSpec): 문자열 또는 { from, ... }
        message = "값 표기가 맞지 않음: 문자열('{id}') 또는 { from, format, default } 이어야 한다";
        break;
      case 'minProperties':
      case 'maxProperties':
        message = e.keyword === 'minProperties' ? '키가 하나 이상 있어야 한다' : '키는 하나만 쓸 수 있다';
        break;
      default:
        message = e.message ?? e.keyword;
    }
    const path = toPath(segs);
    const key = `${code}|${path}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const issue: Issue = { code, severity: 'error', path, message, line: lineOf(segs) };
    if (expected !== undefined) issue.expected = expected;
    if (candidates?.length) issue.candidates = candidates;
    // 가까운 바인딩의 id
    const bi = segs.findIndex((s, i) => s === 'bindings' || (s === 'do' && typeof segs[i + 1] === 'number'));
    if (bi >= 0) {
      let node: unknown = root;
      let id: unknown;
      for (let i = 0; i < segs.length; i++) {
        node = (node as Record<string | number, unknown> | undefined)?.[segs[i]];
        if (typeof (node as { id?: unknown } | undefined)?.id === 'string') id = (node as { id: string }).id;
      }
      if (typeof id === 'string') issue.id = id;
    }
    out.push(issue);
  }
  return out;
}

export function applyDefaults(raw: Record<string, unknown>): Profile {
  const p = structuredClone(raw) as unknown as Profile & {
    output?: Partial<Profile['output']>;
    policy?: Partial<Profile['policy']>;
  };
  p.output = {
    tablePageBreak: p.output?.tablePageBreak ?? 'cell',
    fitHeights: p.output?.fitHeights ?? true,
    diagram: { maxWidthHu: p.output?.diagram?.maxWidthHu ?? 40000, scale: p.output?.diagram?.scale ?? 2 },
  };
  p.policy = {
    onMissingLabel: p.policy?.onMissingLabel ?? 'error',
    onMissingField: p.policy?.onMissingField ?? 'error',
    onMissingRenderer: p.policy?.onMissingRenderer ?? 'error',
    onUnmappedData: p.policy?.onUnmappedData ?? 'warn',
  };
  return p as Profile;
}

/** 프로필 YAML 텍스트를 읽고 스키마로 검증한다(환경 중립). 양식 대조는 checkProfile이 한다. */
export function parseProfile(text: string): ParseResult {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc });
  const issues: Issue[] = [];
  for (const err of doc.errors) {
    issues.push({
      code: 'yaml-syntax',
      severity: 'error',
      path: '',
      line: err.linePos?.[0].line,
      message: err.message.split('\n')[0],
    });
  }
  if (issues.length) return { issues };
  const root = doc.toJS() as unknown;
  const lineOf = (segs: (string | number)[]): number | undefined => {
    for (let n = segs.length; n >= 0; n--) {
      const node = doc.getIn(segs.slice(0, n), true) as Node | null | undefined;
      const off =
        node && typeof node === 'object' && 'range' in node
          ? (node.range as [number, number, number] | null | undefined)?.[0]
          : undefined;
      if (off !== undefined) return lc.linePos(off).line;
    }
    return undefined;
  };
  const lineOfPath = (path: string) => lineOf(pathToSegs(path));
  const v = getValidator();
  if (v(root)) return { profile: applyDefaults(root as Record<string, unknown>), issues, lineOf: lineOfPath };
  return { issues: toIssues(v.errors ?? [], root, lineOf), lineOf: lineOfPath };
}
