import type { Format, ValueSpec } from '../profile/types';

/** 데이터 범위(가까운 것부터). repeat 안에서는 [항목, ...바깥 범위, 전체 데이터] */
export type Scopes = Record<string, unknown>[];

/** 점 표기 경로를 해석한다. 첫 토막은 가까운 범위부터 찾는다. 없으면 undefined. */
export function getPath(scopes: Scopes, path: string): unknown {
  const [head, ...rest] = path.split('.');
  const scope = scopes.find((s) => Object.hasOwn(s, head));
  if (!scope) return undefined;
  let v: unknown = scope[head];
  for (const k of rest) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export function formatValue(v: unknown, format: Format = 'plain'): string {
  if (Array.isArray(v)) {
    const items = v.map(String);
    switch (format) {
      case 'numbered':
        return items.map((s, i) => `${i + 1}. ${s}`).join('\n');
      case 'bulleted':
        return items.map((s) => `- ${s}`).join('\n');
      case 'join':
        return items.join(', ');
      default:
        return items.join('\n');
    }
  }
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const TOKEN = /\{([^{}]+)\}/g;

/** 값 표기를 문자열로 만든다. 값이 없으면 undefined(= 값 없음). */
export function resolveValue(spec: ValueSpec, scopes: Scopes): string | undefined {
  if (typeof spec === 'string') {
    const tokens = [...spec.matchAll(TOKEN)];
    if (tokens.length === 0) return spec;
    if (tokens.length === 1 && tokens[0][0] === spec) {
      const v = getPath(scopes, tokens[0][1]);
      return isEmpty(v) ? undefined : formatValue(v);
    }
    return spec.replace(TOKEN, (_, p: string) => {
      const v = getPath(scopes, p);
      return isEmpty(v) ? '' : formatValue(v);
    });
  }
  const v = getPath(scopes, spec.from);
  if (isEmpty(v)) return spec.default;
  return formatValue(v, spec.format);
}
