import type { DocumentEngine } from '../engine/types';
import { closest, type Issue, type IssueCode } from './issues';
import { kindByName } from './kinds';
import { analyzeTemplate, type TemplateFacts } from './analyze';
import type { Binding, Collection, Locator, Policy, Profile, Slot } from './types';

export interface CheckResult {
  ok: boolean;
  issues: Issue[];
}

type Var =
  | { type: 'meta' }
  | { type: 'capture' }
  | { type: 'collection'; name: string; def: Collection }
  | { type: 'slot'; collection: string; slot: Slot };

type Scope = Map<string, Var>;

const TOKEN = /\{([^{}]+)\}/g;

function captures(pattern: string): string[] {
  return [...pattern.matchAll(TOKEN)].map((m) => m[1]);
}

function itemScope(name: string, def: Collection, parent: Scope): Scope {
  const sc: Scope = new Map(parent);
  for (const c of captures(def.heading.pattern)) sc.set(c, { type: 'capture' });
  for (const sl of def.slots ?? []) sc.set(sl.key, { type: 'slot', collection: name, slot: sl });
  for (const [cn, cd] of Object.entries(def.children ?? {}))
    sc.set(cn, { type: 'collection', name: `${name}.${cn}`, def: cd });
  return sc;
}

/** JSON Schema에서 컬렉션 항목의 슬롯(객체)의 required 키 목록 */
function requiredOf(schema: object, collection: string, slotKey: string): string[] {
  const top = collection.split('.')[0];
  const props = (
    schema as { properties?: Record<string, { items?: { properties?: Record<string, { required?: string[] }> } }> }
  ).properties;
  return props?.[top]?.items?.properties?.[slotKey]?.required ?? [];
}

const sev = (p: Policy): Issue['severity'] | null => (p === 'ignore' ? null : p === 'warn' ? 'warning' : 'error');

/**
 * 프로필을 양식과 대조해 점검한다. 오류는 구조화된 항목(코드·경로·후보)으로 돌려주므로
 * LLM이 이 결과만 보고 프로필을 고칠 수 있다.
 */
export async function checkProfile(
  engine: DocumentEngine,
  profile: Profile,
  template: Uint8Array,
  opts: { lineOf?: (path: string) => number | undefined; dataSchema?: object } = {},
): Promise<CheckResult> {
  const facts = await analyzeTemplate(engine, template);
  const issues: Issue[] = [];
  const add = (
    code: IssueCode,
    severity: Issue['severity'] | null,
    path: string,
    message: string,
    extra: Partial<Issue> = {},
  ) => {
    if (!severity) return;
    issues.push({ code, severity, path, message, line: opts.lineOf?.(path), ...extra });
  };

  for (const w of facts.warnings) add('kind-not-supported', 'error', 'template', w);

  // md 데이터 모델
  const root: Scope = new Map();
  if (profile.md.frontMatter) root.set(profile.md.frontMatter, { type: 'meta' });
  for (const [n, d] of Object.entries(profile.md.collections)) root.set(n, { type: 'collection', name: n, def: d });
  const usedSlots = new Set<string>();

  // 같은 컬렉션 안의 이름 충돌 (캡처·슬롯·하위 컬렉션)
  const conflicts = (name: string, def: Collection, path: string) => {
    const seen = new Map<string, string>();
    const claim = (n: string, what: string) => {
      if (seen.has(n))
        add('name-conflict', 'error', path, `이름 '${n}'이 ${seen.get(n)}과(와) ${what}에서 겹침`, { actual: n });
      else seen.set(n, what);
    };
    for (const c of captures(def.heading.pattern)) claim(c, '제목 캡처');
    for (const sl of def.slots ?? []) claim(sl.key, '슬롯');
    for (const cn of Object.keys(def.children ?? {})) claim(cn, '하위 컬렉션');
    for (const [cn, cd] of Object.entries(def.children ?? {})) conflicts(`${name}.${cn}`, cd, `${path}.children.${cn}`);
  };
  for (const [n, d] of Object.entries(profile.md.collections)) conflicts(n, d, `md.collections.${n}`);

  /** 데이터 경로를 해석한다. 못 찾으면 path-unknown 항목을 추가하고 null을 돌려준다. */
  const resolve = (path: string, scope: Scope, at: string): Var | null => {
    const [head, ...rest] = path.split('.');
    const v = scope.get(head);
    if (!v) {
      add('path-unknown', 'error', at, `데이터 경로를 찾을 수 없음: ${path}`, {
        actual: path,
        candidates: closest(
          head,
          [...scope.keys()].filter((k) => !k.startsWith('\0')),
        ),
      });
      return null;
    }
    if (rest.length && v.type !== 'meta' && !(v.type === 'slot' && v.slot.as === 'kv')) {
      add('path-unknown', 'error', at, `${head}에는 하위 경로(.${rest.join('.')})가 없음`, { actual: path });
      return null;
    }
    if (v.type === 'slot') usedSlots.add(`${v.collection}.${v.slot.key}`);
    return v;
  };

  const checkValue = (spec: unknown, scope: Scope, at: string) => {
    if (typeof spec === 'string') {
      for (const m of spec.matchAll(TOKEN)) resolve(m[1], scope, at);
    } else if (spec && typeof spec === 'object' && 'from' in spec) {
      resolve(String((spec as { from: unknown }).from), scope, at);
    }
  };

  // 양식의 표 찾기
  type T = TemplateFacts['tables'][number];
  const findTables = (loc: Locator): T[] | 'unsupported' => {
    const t = loc.table;
    if (!t) return 'unsupported';
    const col = t.column ?? 0;
    void col; // facts.labels는 0열 기준. 다른 열 지정은 현재 지원하지 않는다
    return facts.tables.filter((x) => {
      if (t.label !== undefined) return x.labels.includes(t.label.trim());
      if (t.headerLabel !== undefined) return x.header.includes(t.headerLabel.trim());
      if (t.index !== undefined) return x.index === t.index;
      if (t.text !== undefined)
        return (
          x.sample.some((c) => c.text.includes(t.text as string)) || x.labels.some((l) => l.includes(t.text as string))
        );
      return false;
    });
  };
  const resolveTable = (loc: Locator, at: string): T | null => {
    const found = findTables(loc);
    if (found === 'unsupported') {
      add(
        'kind-not-supported',
        'error',
        at,
        `이 위치 지정은 아직 지원하지 않음 (지원: table). 지정한 키: ${Object.keys(loc).join(', ')}`,
      );
      return null;
    }
    if (loc.table?.column !== undefined && loc.table.column !== 0) {
      add('kind-not-supported', 'error', `${at}.table.column`, '라벨 열은 현재 0열만 지원한다');
      return null;
    }
    if (found.length === 0) {
      const t = loc.table ?? {};
      const pool =
        t.headerLabel !== undefined ? facts.tables.flatMap((x) => x.header) : facts.tables.flatMap((x) => x.labels);
      const want = t.label ?? t.headerLabel ?? t.text ?? '';
      const all = pool;
      add(
        'table-not-found',
        sev(profile.policy.onMissingLabel),
        at,
        `양식에서 위치 지정에 맞는 표가 없음: ${JSON.stringify(loc.table)}`,
        {
          actual: loc.table,
          candidates: want ? closest(want, all) : undefined,
        },
      );
      return null;
    }
    if (found.length > 1) {
      add(
        'table-ambiguous',
        'error',
        at,
        `위치 지정에 맞는 표가 ${found.length}개 (표 번호: ${found.map((x) => x.index).join(', ')})`,
        { actual: found.map((x) => x.index) },
      );
      return null;
    }
    return found[0];
  };

  const walk = (bindings: Binding[], base: string, scope: Scope, unit: T | null | 'failed') => {
    bindings.forEach((b, i) => {
      const path = `${base}[${i}]`;
      const id = typeof b.id === 'string' ? b.id : undefined;
      const here = (
        code: IssueCode,
        severity: Issue['severity'] | null,
        p: string,
        message: string,
        extra: Partial<Issue> = {},
      ) => add(code, severity, p, message, { id, ...extra });
      const def = kindByName(b.kind);
      if (!def) return; // 스키마 단계에서 이미 unknown-kind
      if (def.status === 'defined') {
        here('kind-not-supported', 'error', path, `kind '${b.kind}'은 형식에는 정의됐지만 아직 지원하지 않음(검증 전)`);
        return;
      }
      switch (b.kind) {
        case 'fields': {
          const map = (b.map ?? {}) as Record<string, string>;
          const names = facts.fields.map((f) => f.name);
          for (const [data, fieldName] of Object.entries(map)) {
            resolve(data, scope, `${path}.map.${data}`);
            if (!names.includes(fieldName))
              here(
                'field-not-found',
                sev(profile.policy.onMissingField),
                `${path}.map.${data}`,
                `양식에 없는 누름틀: ${fieldName}`,
                {
                  actual: fieldName,
                  candidates: closest(fieldName, names),
                },
              );
          }
          break;
        }
        case 'repeat': {
          const over = String(b.over);
          const v = scope.get(over);
          let next: Scope | null = null;
          if (v?.type === 'collection') {
            next = itemScope(v.name, v.def, scope);
            next.set('\0coll', { type: 'collection', name: v.name, def: v.def });
          } else
            here('collection-unknown', 'error', `${path}.over`, `선언하지 않은 컬렉션: ${over}`, {
              actual: over,
              candidates: closest(
                over,
                [...scope.entries()].filter(([, x]) => x.type === 'collection').map(([k]) => k),
              ),
            });
          if (b.onEmpty === 'remove')
            here('kind-not-supported', 'error', `${path}.onEmpty`, "onEmpty 'remove'는 아직 지원하지 않음");
          const tbl = resolveTable(b.unit as Locator, `${path}.unit`);
          if (next) walk((b.do ?? []) as Binding[], `${path}.do`, next, tbl ?? 'failed');
          break;
        }
        case 'cells': {
          const tbl = b.in ? resolveTable(b.in as Locator, `${path}.in`) : unit === 'failed' ? null : unit;
          if (!b.in && !unit) {
            here('locator-required', 'error', path, 'cells는 in으로 표를 지정하거나 repeat의 do 안에서 써야 함');
            break;
          }
          const map = (b.map ?? {}) as Record<string, unknown>;
          if (Object.keys(map).length === 0) here('binding-empty', 'error', `${path}.map`, 'map이 비어 있음');
          const labels = tbl?.labels ?? [];
          for (const [label, spec] of Object.entries(map)) {
            const at = `${path}.map.${label}`;
            if (label === '*') {
              const v = typeof spec === 'string' ? resolve(spec, scope, at) : null;
              if (v && !(v.type === 'slot' && v.slot.as === 'kv'))
                here('slot-type-mismatch', 'error', at, "'*'는 kv 슬롯(키-값 표)을 가리켜야 함", { actual: spec });
              continue;
            }
            if (tbl && !labels.includes(label.trim()))
              here('label-not-found', sev(profile.policy.onMissingLabel), at, `표에 없는 라벨: ${label}`, {
                actual: label,
                candidates: closest(label, labels),
              });
            checkValue(spec, scope, at);
          }
          if (tbl && !('*' in map)) {
            const miss = labels.filter((l) => !(l in map));
            if (miss.length)
              here(
                'label-unmapped',
                'warning',
                `${path}.map`,
                `매핑되지 않은 양식 라벨(값 없음으로 처리): ${miss.join(', ')}`,
                { actual: miss },
              );
          }
          // md 규약(JSON Schema)의 필수 항목이 양식에 채워지는가 (kv 슬롯의 필수 키)
          if (opts.dataSchema && tbl && scope.has('\0coll')) {
            const cv = scope.get('\0coll') as unknown as { name: string; def: Collection };
            for (const sl of cv.def.slots ?? []) {
              if (sl.as !== 'kv') continue;
              const req = requiredOf(opts.dataSchema, cv.name, sl.key);
              for (const k of req) {
                const mapped = k in map || ('*' in map && (map['*'] as unknown) === sl.key);
                if (!mapped)
                  here(
                    'schema-required-unmapped',
                    'warning',
                    `${path}.map`,
                    `규약의 필수 항목 '${k}'이(가) 매핑되지 않음`,
                    { actual: k },
                  );
                else if (!labels.includes(k))
                  here(
                    'schema-required-unmapped',
                    'warning',
                    `${path}.map`,
                    `규약의 필수 항목 '${k}'이(가) 양식 표의 라벨에 없음`,
                    { actual: k, candidates: closest(k, labels) },
                  );
              }
            }
          }
          break;
        }
        case 'diagrams': {
          const v = resolve(String(b.from), scope, `${path}.from`);
          if (v && !(v.type === 'slot' && v.slot.as === 'code'))
            here('slot-type-mismatch', 'error', `${path}.from`, 'diagrams의 from은 code 슬롯을 가리켜야 함', {
              actual: b.from,
            });
          if (b.place === 'atMarker')
            here('kind-not-supported', 'error', `${path}.place`, "place 'atMarker'는 아직 지원하지 않음");
          break;
        }
      }
    });
  };

  walk(profile.bindings, 'bindings', root, null);

  // md에서 읽지만 어디에도 쓰이지 않는 슬롯
  const unusedSev = sev(profile.policy.onUnmappedData);
  const scan = (name: string, def: Collection, path: string) => {
    (def.slots ?? []).forEach((sl, i) => {
      if (!usedSlots.has(`${name}.${sl.key}`))
        add('slot-unused', unusedSev, `${path}.slots[${i}]`, `슬롯 '${sl.key}'을 읽지만 어떤 바인딩도 쓰지 않음`);
    });
    for (const [cn, cd] of Object.entries(def.children ?? {})) scan(`${name}.${cn}`, cd, `${path}.children.${cn}`);
  };
  for (const [n, d] of Object.entries(profile.md.collections)) scan(n, d, `md.collections.${n}`);

  return { ok: !issues.some((x) => x.severity === 'error'), issues };
}
