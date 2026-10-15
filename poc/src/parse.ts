import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import YAML from 'yaml';
import type { Code, Heading, List, Root, RootContent, Table } from 'mdast';

export interface Diagram {
  source: string;
  line: number;
}

export interface UseCaseItem {
  id: string;
  name: string;
  line: number;
  fields: Record<string, string>;
  fieldsLine: number;
  fieldLines: Record<string, number>;
  flows: { main: string[]; alt: string[] };
  flowLines: { main: number; alt: number };
  diagrams: Diagram[];
}

export interface Ir {
  meta: Record<string, unknown>;
  metaLine: number;
  items: UseCaseItem[];
  warnings: { line: number; message: string }[];
}

/** 노드에서 글자만 뽑는다 (인라인 서식 제거, 줄바꿈은 \n) */
function text(node: unknown): string {
  const n = node as { type: string; value?: string; children?: unknown[] };
  if (n.type === 'break') return '\n';
  if (typeof n.value === 'string') return n.value;
  return (n.children ?? []).map(text).join('');
}

const line = (n: RootContent | Root): number => n.position?.start.line ?? 0;

export function parseMarkdown(md: string): Ir {
  const tree = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm).parse(md) as Root;
  const ir: Ir = { meta: {}, metaLine: 1, items: [], warnings: [] };

  let cur: UseCaseItem | null = null;
  let section: 'main' | 'alt' | null = null;

  for (const node of tree.children) {
    if (node.type === 'yaml') {
      ir.metaLine = line(node);
      try {
        ir.meta = (YAML.parse(node.value) ?? {}) as Record<string, unknown>;
      } catch (e) {
        ir.warnings.push({ line: line(node), message: `front-matter 해석 실패: ${(e as Error).message}` });
      }
      continue;
    }

    if (node.type === 'heading') {
      const h = node as Heading;
      const title = text(h).trim();
      if (h.depth === 2) {
        const m = /^(\S+)\s+(.+)$/.exec(title);
        cur = {
          id: m ? m[1] : title,
          name: m ? m[2] : '',
          line: line(h),
          fields: {},
          fieldsLine: line(h),
          fieldLines: {},
          flows: { main: [], alt: [] },
          flowLines: { main: line(h), alt: line(h) },
          diagrams: [],
        };
        ir.items.push(cur);
        section = null;
      } else if (h.depth === 3 && cur) {
        if (title === '기본 흐름') section = 'main';
        else if (title === '대안 흐름') section = 'alt';
        else {
          section = null;
          ir.warnings.push({ line: line(h), message: `알 수 없는 H3 제목 무시: ${title}` });
        }
        if (section) cur.flowLines[section] = line(h);
      }
      continue;
    }

    if (!cur) continue;

    if (node.type === 'table') {
      const t = node as Table;
      cur.fieldsLine = line(t);
      t.children.slice(1).forEach((row) => {
        const cells = row.children.map((c) => text(c).trim());
        if (cells.length >= 2 && cells[0]) {
          cur!.fields[cells[0]] = cells[1];
          cur!.fieldLines[cells[0]] = line(row);
        }
      });
    } else if (node.type === 'list' && section) {
      const l = node as List;
      cur.flows[section] = l.children.map((li) => text(li).trim());
    } else if (node.type === 'code' && (node as Code).lang === 'mermaid') {
      cur.diagrams.push({ source: (node as Code).value, line: line(node) });
    }
  }
  return ir;
}
