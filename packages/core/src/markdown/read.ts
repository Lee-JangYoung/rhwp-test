import type { Code, Heading, List, ListItem, Paragraph, Root, RootContent, Table } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import YAML from 'yaml';
import type { Collection, Profile, Slot } from '../profile/types';

export interface Violation {
  line: number;
  path: string;
  message: string;
}

export interface MdRead {
  /** 프로필의 md 규칙으로 읽은 데이터 트리: { <frontMatter>: {...}, <컬렉션>: [{ <캡처>, <슬롯>, <하위 컬렉션> }] } */
  data: Record<string, unknown>;
  /** JSON 포인터 → md 줄 번호 (위반 메시지용) */
  lines: Map<string, number>;
  /** 구조 위반(프로필의 md 규칙과 맞지 않음). 규약(JSON Schema) 위반은 validateData가 따로 낸다 */
  violations: Violation[];
  warnings: { line: number; message: string }[];
}

type MdNode = RootContent;

/** 노드에서 글자만 뽑는다 (인라인 서식 제거, 줄바꿈은 \n) */
function text(node: unknown): string {
  const n = node as { type: string; value?: string; children?: unknown[] };
  if (n.type === 'break') return '\n';
  // 표 셀 안의 <br>은 줄바꿈이다(LLM이 표 셀에서 줄을 나눌 때 흔히 쓴다)
  if (n.type === 'html' && typeof n.value === 'string' && /^<br\s*\/?>$/i.test(n.value.trim())) return '\n';
  if (typeof n.value === 'string') return n.value;
  return (n.children ?? []).map(text).join('');
}

const lineOf = (n: MdNode | Root): number => n.position?.start.line ?? 0;
const esc = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const ptr = (base: string, key: string | number) => `${base}/${esc(String(key))}`;

/**
 * 제목 패턴 '{id} {name}'을 앵커 정규식으로 바꾼다.
 * 리터럴은 그대로(공백은 공백 연속), 각 캡처는 최소 일치, 마지막 캡처는 나머지 전부.
 */
export function compileHeadingPattern(pattern: string): { regex: RegExp; names: string[] } {
  const names: string[] = [];
  let src = '';
  let last = 0;
  for (const m of pattern.matchAll(/\{([^{}]+)\}/g)) {
    src += literal(pattern.slice(last, m.index));
    names.push(m[1]);
    src += '(.+?)';
    last = (m.index ?? 0) + m[0].length;
  }
  src += literal(pattern.slice(last));
  return { regex: new RegExp(`^${src}$`), names };
}
const literal = (s: string) =>
  s
    .split(/\s+/)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');

interface Section {
  heading: Heading;
  depth: number;
  title: string;
  nodes: MdNode[];
}

/** 영역(노드 목록)을 본문(첫 제목 앞)과 제목별 구역(다음 제목 앞까지)으로 나눈다. */
function split(nodes: MdNode[]): { body: MdNode[]; sections: Section[] } {
  const body: MdNode[] = [];
  const sections: Section[] = [];
  for (const n of nodes) {
    if (n.type === 'heading') {
      const h = n as Heading;
      sections.push({ heading: h, depth: h.depth, title: text(h).trim(), nodes: [] });
    } else if (sections.length) sections[sections.length - 1].nodes.push(n);
    else body.push(n);
  }
  return { body, sections };
}

/** 컬렉션 항목: level 제목마다, 같은 수준 이하 제목 앞까지가 그 항목의 영역 */
function items(nodes: MdNode[], level: number): { heading: Heading; region: MdNode[] }[] {
  const out: { heading: Heading; region: MdNode[] }[] = [];
  let cur: { heading: Heading; region: MdNode[] } | null = null;
  for (const n of nodes) {
    if (n.type === 'heading' && (n as Heading).depth <= level) {
      cur = (n as Heading).depth === level ? { heading: n as Heading, region: [] } : null;
      if (cur) out.push(cur);
    } else cur?.region.push(n);
  }
  return out;
}

const TABLE_SLOTS = new Set<Slot['as']>(['kv', 'records', 'table']);
const isOptional = (s: Slot) => s.optional ?? s.as === 'code';

export function readMarkdown(profile: Pick<Profile, 'md'>, md: string): MdRead {
  const tree = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm).parse(md) as Root;
  const out: MdRead = { data: {}, lines: new Map(), violations: [], warnings: [] };
  const viol = (line: number, path: string, message: string) => out.violations.push({ line, path, message });

  const fm = profile.md.frontMatter;
  for (const node of tree.children) {
    if (node.type !== 'yaml') continue;
    if (!fm) break;
    out.lines.set(`/${esc(fm)}`, lineOf(node));
    try {
      // 값은 문자열로 보존한다(1.10→1.1, 0123→123 같은 숫자 변환 방지). 규약(JSON Schema)은 문자열 기준이다.
      out.data[fm] = (YAML.parse((node as { value: string }).value, { schema: 'failsafe' }) ?? {}) as Record<
        string,
        unknown
      >;
    } catch (e) {
      out.warnings.push({ line: lineOf(node), message: `front-matter 해석 실패: ${(e as Error).message}` });
    }
    break;
  }
  if (fm && !(fm in out.data)) out.data[fm] = {};

  const readSlotsAndChildren = (
    def: Collection,
    base: string,
    node: Record<string, unknown>,
    region: MdNode[],
    headLine: number,
  ) => {
    const { body, sections: all } = split(region);
    const used = new Set<Section>();
    // 하위 컬렉션 항목에 속한 구역(자기 제목 수준의 제목부터 같은 수준 이하 제목 앞까지)과 이 항목 자신의 구역을 나눈다.
    // 부모 슬롯의 under가 가리키는 제목은 하위 항목이 아니다.
    const childLevelSet = new Set(Object.values(def.children ?? {}).map((c) => c.heading.level));
    const claimed = new Set((def.slots ?? []).flatMap((s) => (s.under === undefined ? [] : [s.under.trim()])));
    const sections: Section[] = [];
    const childNodes: MdNode[] = [];
    let inChild: number | null = null;
    for (const sec of all) {
      if (inChild !== null && sec.depth > inChild) {
        childNodes.push(sec.heading, ...sec.nodes);
        continue;
      }
      inChild = null;
      if (childLevelSet.has(sec.depth) && !claimed.has(sec.title)) {
        inChild = sec.depth;
        childNodes.push(sec.heading, ...sec.nodes);
        continue;
      }
      sections.push(sec);
    }
    // 코드 블록은 위치와 무관하게 언어로 식별하므로, under가 없는 code 슬롯은 항목 영역 전체(하위 컬렉션 제외)에서 읽는다
    const everywhere = [...body, ...sections.flatMap((x) => x.nodes)];
    // 슬롯을 읽는 영역별로 묶는다 (under 없음 = 본문)
    const groups = new Map<string, { slots: Slot[]; nodes: MdNode[]; line: number; missingHeading: boolean }>();
    for (const slot of def.slots ?? []) {
      const key = slot.under === undefined ? (slot.as === 'code' ? '\0code' : '\0body') : slot.under.trim();
      let g = groups.get(key);
      if (!g) {
        if (slot.under === undefined)
          g = { slots: [], nodes: slot.as === 'code' ? everywhere : body, line: headLine, missingHeading: false };
        else {
          const found = sections.filter((s) => s.title === key);
          if (found.length > 1) viol(lineOf(found[1].heading), base, `제목 '${key}'가 여러 개`);
          const sec = found[0];
          if (sec) used.add(sec);
          g = { slots: [], nodes: sec?.nodes ?? [], line: sec ? lineOf(sec.heading) : headLine, missingHeading: !sec };
        }
        groups.set(key, g);
      }
      g.slots.push(slot);
    }
    const consumedCodes = new Set<Code>();
    for (const [key, g] of groups) {
      const tables = g.nodes.filter((n): n is Table => n.type === 'table');
      const lists = g.nodes.filter((n): n is List => n.type === 'list');
      const paras = g.nodes.filter((n): n is Paragraph => n.type === 'paragraph');
      const codes = g.nodes.filter((n): n is Code => n.type === 'code');
      let ti = 0;
      let li = 0;
      let textTaken = false;
      for (const slot of g.slots) {
        const at = ptr(base, slot.key);
        const missing = (what: string) => {
          // 없는 슬롯은 "값 없음"으로 고정한다(바깥 범위의 같은 이름 값이 끼어들지 않게)
          node[slot.key] = undefined;
          if (isOptional(slot)) return;
          const why = g.missingHeading ? `제목 '${key}'가 없음` : `${what}가 없음`;
          viol(g.line, at, `필수 항목 누락: ${slot.key} (${why})`);
        };
        if (TABLE_SLOTS.has(slot.as)) {
          const t = tables[ti++];
          if (!t) {
            missing('표');
            continue;
          }
          out.lines.set(at, lineOf(t));
          const rows = t.children;
          if (slot.as === 'kv') {
            const obj: Record<string, string> = {};
            for (const row of rows.slice(1)) {
              const cells = row.children.map((c) => text(c).trim());
              if (cells.length < 2 || !cells[0]) {
                viol(lineOf(row), at, '표 행에는 키(1열)와 값(2열)이 필요함');
                continue;
              }
              if (cells.length > 2)
                viol(lineOf(row), at, `표 행은 키·값 두 열만 쓸 수 있음(${cells.length}열: 3열 이후는 읽지 않음)`);
              if (Object.hasOwn(obj, cells[0])) viol(lineOf(row), ptr(at, cells[0]), `키가 중복됨: ${cells[0]}`);
              Object.defineProperty(obj, cells[0], {
                value: cells[1],
                enumerable: true,
                writable: true,
                configurable: true,
              });
              out.lines.set(ptr(at, cells[0]), lineOf(row));
            }
            node[slot.key] = obj;
          } else if (slot.as === 'records') {
            const head = rows[0]?.children.map((c) => text(c).trim()) ?? [];
            const recs = rows.slice(1).map((row, i) => {
              const cells = row.children.map((c) => text(c).trim());
              if (cells.length !== head.length)
                viol(lineOf(row), ptr(at, i), `열 수가 머리행과 다름(${cells.length} ≠ ${head.length})`);
              out.lines.set(ptr(at, i), lineOf(row));
              return Object.fromEntries(head.map((h, c) => [h, cells[c] ?? '']));
            });
            node[slot.key] = recs;
          } else {
            node[slot.key] = {
              header: rows[0]?.children.map((c) => text(c).trim()) ?? [],
              rows: rows.slice(1).map((r) => r.children.map((c) => text(c).trim())),
            };
          }
        } else if (slot.as === 'list') {
          const l = lists[li++];
          if (!l) {
            missing('목록');
            continue;
          }
          out.lines.set(at, lineOf(l));
          node[slot.key] = l.children.map((item: ListItem, i) => {
            if (item.children.some((c) => c.type === 'list'))
              viol(lineOf(item), ptr(at, i), '중첩 목록은 지원하지 않음');
            out.lines.set(ptr(at, i), lineOf(item));
            return item.children
              .filter((c) => c.type !== 'list')
              .map((c) => text(c).trim())
              .join('\n')
              .trim();
          });
        } else if (slot.as === 'text') {
          if (textTaken || paras.length === 0) {
            if (!textTaken) missing('문단');
            continue;
          }
          textTaken = true;
          out.lines.set(at, lineOf(paras[0]));
          node[slot.key] = paras.map((p) => text(p).trim()).join('\n');
        } else if (slot.as === 'code') {
          const mine = codes.filter((c) => slot.lang === undefined || c.lang === slot.lang);
          if (mine.length === 0) {
            missing('코드 블록');
            continue;
          }
          out.lines.set(at, lineOf(mine[0]));
          for (const c of mine) consumedCodes.add(c);
          node[slot.key] = mine.map((c, i) => {
            out.lines.set(ptr(at, i), lineOf(c));
            return c.value;
          });
        }
      }
      // 슬롯에 연결되지 않은 표·목록은 모호하므로 위반(엄격). 코드 블록 그룹은 표·목록을 읽지 않는다
      if (key === '\0code') continue;
      const lostTables = tables.slice(ti);
      for (const t of lostTables) viol(lineOf(t), base, '슬롯에 연결되지 않은 표');
      for (const l of lists.slice(li)) viol(lineOf(l), base, '슬롯에 연결되지 않은 목록');
      // 문단은 text 슬롯이 없으면 읽지 않는다: 조용히 버리지 않고 경고한다
      if (!g.slots.some((x) => x.as === 'text'))
        for (const p of paras) out.warnings.push({ line: lineOf(p), message: '슬롯에 연결되지 않은 문단은 읽지 않음' });
    }
    // 코드 블록도 읽는 슬롯이 없으면 위반(조용한 손실 금지)
    for (const c of everywhere.filter((n): n is Code => n.type === 'code'))
      if (!consumedCodes.has(c)) viol(lineOf(c), base, `${c.lang ? `'${c.lang}' ` : ''}코드 블록을 읽는 슬롯이 없음`);
    // 하위 컬렉션
    const childLevels = new Set<number>();
    for (const [cn, cd] of Object.entries(def.children ?? {})) {
      childLevels.add(cd.heading.level);
      readCollection(cn, cd, childNodes, ptr(base, cn), node);
    }
    // 어디에도 쓰이지 않은 제목은 위반: 그 아래 내용이 조용히 사라지기 때문이다(제목 수준·철자 오류)
    const known = [
      ...claimed,
      ...Object.values(def.children ?? {}).map((c) => `'${c.heading.pattern}'(${'#'.repeat(c.heading.level)})`),
    ];
    for (const s of sections) {
      if (!used.has(s) && !childLevels.has(s.depth))
        viol(
          lineOf(s.heading),
          base,
          `알 수 없는 제목: '${s.title}' (이 항목에서 읽는 제목: ${known.join(', ') || '없음'}. 제목 수준·철자를 확인하세요)`,
        );
    }
  };

  const readCollection = (
    name: string,
    def: Collection,
    nodes: MdNode[],
    base: string,
    parent: Record<string, unknown>,
  ) => {
    const { regex, names } = compileHeadingPattern(def.heading.pattern);
    const list: Record<string, unknown>[] = [];
    items(nodes, def.heading.level).forEach(({ heading, region }) => {
      const at = ptr(base, list.length);
      const title = text(heading).trim();
      const m = regex.exec(title);
      out.lines.set(at, lineOf(heading));
      if (!m) {
        viol(lineOf(heading), at, `제목이 패턴과 맞지 않음: '${title}' (기대: ${def.heading.pattern})`);
        return;
      }
      const node: Record<string, unknown> = {};
      names.forEach((n, k) => {
        node[n] = m[k + 1].trim();
        out.lines.set(ptr(at, n), lineOf(heading));
      });
      readSlotsAndChildren(def, at, node, region, lineOf(heading));
      list.push(node);
    });
    parent[name] = list;
  };

  for (const [name, def] of Object.entries(profile.md.collections)) {
    readCollection(
      name,
      def,
      tree.children.filter((n) => n.type !== 'yaml'),
      `/${esc(name)}`,
      out.data,
    );
  }
  return out;
}
