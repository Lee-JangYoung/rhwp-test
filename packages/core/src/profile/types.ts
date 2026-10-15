export type Format = 'plain' | 'numbered' | 'bulleted' | 'lines' | 'join';
export type ValueSpec = string | { from: string; format?: Format; default?: string };

/** 양식 안의 위치 지정 (키 하나만 쓴다) */
export interface Locator {
  table?: { label?: string; headerLabel?: string; index?: number; text?: string; column?: number };
  range?: { start: Locator; end: Locator };
  paragraph?: { text?: string; style?: string; bookmark?: string };
  row?: { label?: string };
  field?: string;
  bookmark?: string;
}

export interface Slot {
  as: 'kv' | 'records' | 'list' | 'text' | 'code' | 'table';
  key: string;
  under?: string;
  optional?: boolean;
  lang?: string;
}

export interface Collection {
  heading: { level: number; pattern: string };
  slots?: Slot[];
  children?: Record<string, Collection>;
}

export interface Binding {
  kind: string;
  id?: string;
  [key: string]: unknown;
}

export interface Profile {
  version: 1;
  type: string;
  name?: string;
  template: string;
  schema?: string;
  md: { frontMatter?: string; collections: Record<string, Collection> };
  bindings: Binding[];
  output: {
    tablePageBreak: 'none' | 'table' | 'cell';
    fitHeights: boolean;
    diagram: { maxWidthHu: number; scale: number };
  };
  policy: { onMissingLabel: Policy; onMissingField: Policy; onMissingRenderer: Policy; onUnmappedData: Policy };
}

export type Policy = 'error' | 'warn' | 'ignore';
