import { ISSUE_CODES } from './issues';
import { KINDS, MINIMAL_USECASE, type KindDef } from './kinds';
import { buildProfileSchema } from './schema';

export interface KindDescription {
  name: string;
  status: KindDef['status'];
  summary: string;
  schema: Record<string, unknown>;
  example: string;
}

/**
 * 사용할 수 있는 kind 목록. 기본은 **검증된 kind만** 돌려준다(LLM이 미검증 동작을 쓰지 않게).
 */
export function describeKinds(opts: { includeDefined?: boolean } = {}): KindDescription[] {
  return KINDS.filter((k) => opts.includeDefined || k.status === 'verified').map((k) => ({
    name: k.name,
    status: k.status,
    summary: k.summary,
    schema: k.schema,
    example: k.example,
  }));
}

export type GuideTopic = 'overview' | 'minimal' | 'keys' | 'kinds' | 'locators' | 'paths' | 'errors';
export const GUIDE_TOPICS: GuideTopic[] = ['overview', 'minimal', 'keys', 'kinds', 'locators', 'paths', 'errors'];

type Props = Record<
  string,
  { type?: string; enum?: unknown[]; const?: unknown; description?: string; default?: unknown; $ref?: string }
>;

function keyTable(schema: Record<string, unknown>): string {
  const props = (schema.properties ?? {}) as Props;
  const required = new Set((schema.required ?? []) as string[]);
  const rows = Object.entries(props)
    .filter(([k]) => k !== 'kind')
    .map(([k, v]) => {
      const kind = v.enum
        ? `enum(${v.enum.join(' / ')})`
        : (v.type ?? (v.$ref ? v.$ref.replace('#/$defs/', '') : 'object'));
      const def = v.default !== undefined ? ` (기본 ${JSON.stringify(v.default)})` : '';
      return `| \`${k}\` | ${kind} | ${required.has(k) ? '필수' : '선택'} | ${v.description ?? ''}${def} |`;
    });
  return ['| 키 | 종류 | 필수 | 설명 |', '|---|---|---|---|', ...rows].join('\n');
}

type Node = {
  type?: string;
  enum?: unknown[];
  const?: unknown;
  description?: string;
  default?: unknown;
  properties?: Record<string, Node>;
  required?: string[];
  additionalProperties?: Node | boolean;
  items?: Node;
  $ref?: string;
};

/** 최상위 키 레퍼런스(`bindings` 안은 kind별 표가 따로 있다). 스키마에서 생성한다. */
function keysReference(): string {
  const root = buildProfileSchema() as unknown as Node & { $defs: Record<string, Node> };
  const rows: string[] = [];
  const walk = (node: Node, path: string, required: boolean, stack: string[] = []) => {
    const refName = node.$ref?.replace('#/$defs/', '');
    const n = refName ? { ...root.$defs[refName], ...node } : node;
    if (path) {
      const kind = n.enum
        ? `enum(${n.enum.join(' / ')})`
        : n.const !== undefined
          ? `상수(${JSON.stringify(n.const)})`
          : (n.type ?? 'object');
      const def = n.default !== undefined ? ` (기본 ${JSON.stringify(n.default)})` : '';
      rows.push(`| \`${path}\` | ${kind} | ${required ? '필수' : '선택'} | ${n.description ?? ''}${def} |`);
    }
    if (path === 'bindings') return;
    if (refName && stack.includes(refName)) return; // 재귀 구조(하위 컬렉션)는 한 번만 펼친다
    const nextStack = refName ? [...stack, refName] : stack;
    const req = new Set(n.required ?? []);
    for (const [k, v] of Object.entries(n.properties ?? {})) walk(v, path ? `${path}.${k}` : k, req.has(k), nextStack);
    if (n.additionalProperties && typeof n.additionalProperties === 'object')
      walk(n.additionalProperties, `${path}.<이름>`, false, nextStack);
    if (n.items) walk(n.items, `${path}[]`, false, nextStack);
  };
  walk(root, '', true);
  return `## 파일 구성과 키\n\n프로필은 문서 유형 폴더(\`templates/<유형>/\`)의 \`profile.yaml\`이다. 같은 폴더에 양식(\`template\`), md 규약(\`schema\`), 예제를 둔다. 경로는 프로필 폴더 기준 상대 경로다.\n\n| 키 | 종류 | 필수 | 설명 |\n|---|---|---|---|\n${rows.join('\n')}\n\n\`bindings\`의 항목은 아래 kind별 표를 따른다.`;
}

const SECTIONS: Record<GuideTopic, () => string> = {
  overview: () => `# 프로필 작성 가이드 (형식 v1)

프로필은 "양식의 어디에, md의 무엇을, 어떻게 넣는가"를 잇는 **바인딩의 목록**이다. 양식의 모양(스타일·표 구조)은 양식 파일에 있고 프로필은 연결과 동작만 정한다.

**작성 순서**
1. \`analyzeTemplate\`로 양식의 사실(표·라벨·머리글·누름틀)을 조회한다. **프로필의 위치·라벨·누름틀 이름은 이 결과에 있는 것만 쓴다(추측 금지).**
2. \`describeKinds\`로 쓸 수 있는 동작(kind)을 확인한다. 목록에 없는 kind는 쓰지 않는다.
3. \`md\` 절에 md를 읽는 규칙(컬렉션·슬롯)을, \`bindings\`에 양식과의 연결을 쓴다. 생략할 수 있는 키는 생략한다(기본값이 있다).
4. \`parseProfile\`과 \`checkProfile\`의 오류(\`code\`, \`path\`, \`candidates\`)를 읽고 고친다. 통과할 때까지 반복한다. 통과 전에는 완성으로 간주하지 않는다.

**규칙**: 알 수 없는 키는 오류다. 값을 모르면 만들어 내지 말고 후보(candidates) 중에서 고르거나 비워 둔다.`,
  minimal: () => `## 최소 프로필 예 (유스케이스 명세서)

\`\`\`yaml
${MINIMAL_USECASE.trimEnd()}
\`\`\``,
  keys: keysReference,
  kinds: () =>
    `## 동작(kind)\n\n${KINDS.map(
      (k) =>
        `### ${k.name} — ${k.status === 'verified' ? '사용 가능' : '정의만 됨(아직 쓸 수 없음)'}\n\n${k.summary}\n\n${keyTable(k.schema)}`,
    ).join('\n\n')}`,
  locators: () => `## 양식 위치 지정 (키 하나만 쓴다)

| 위치 | 의미 | 상태 |
|---|---|---|
| \`{ table: { label: X } }\` | 0열에 라벨 X가 있는 표 | 사용 가능 |
| \`{ table: { headerLabel: X } }\` | 첫 행에 X가 있는 표 | 사용 가능 |
| \`{ table: { index: n } }\` | 문서에서 n번째 표(0부터) | 사용 가능 |
| \`{ table: { text: X } }\` | 표 안에 X가 들어 있는 표 | 사용 가능 |
| \`{ range: { start, end } }\` | 시작~끝 사이의 연속 요소 | 아직 지원하지 않음 |
| \`{ paragraph: { text / style / bookmark } }\` | 문단 | 아직 지원하지 않음 |
| \`{ row: { label: X } }\` | 표 안의 행 | 아직 지원하지 않음 |
| \`{ field: X }\`, \`{ bookmark: X }\` | 누름틀, 책갈피 | 아직 지원하지 않음 |

표 안의 라벨·머리글은 \`analyzeTemplate\`의 \`tables[].labels\`, \`header\`에 있는 텍스트를 **공백·철자까지 그대로** 쓴다.`,
  paths: () => `## 데이터 경로와 값 표기

- 경로는 점 표기다. 바깥에서는 \`md.frontMatter\`로 정한 이름(예: \`meta.title\`)과 \`md.collections\`의 이름만 쓸 수 있다.
- \`repeat\` 안(\`do\`)에서는 그 항목 기준이다: 제목 패턴에서 캡처한 이름(\`'{id} {name}'\` → \`id\`, \`name\`), 슬롯의 \`key\`, 하위 컬렉션 이름.
- \`kv\` 슬롯은 \`fields.액터\`처럼 하위 키를 쓸 수 있다. 다른 슬롯은 하위 경로가 없다.
- 값 표기: 자리표시자 문자열 \`'{id}'\` 또는 \`{ from: 경로, format, default }\`. format: plain · numbered · bulleted · lines · join.
- \`cells.map\`의 키 \`'*'\`는 kv 슬롯의 나머지 항목을 같은 이름의 라벨로 채운다.`,
  errors: () => `## 오류 코드와 고치는 법

| code | 의미 | 고치는 법 |
|---|---|---|
${(Object.entries(ISSUE_CODES) as [string, { summary: string; fix: string }][]).map(([c, v]) => `| \`${c}\` | ${v.summary} | ${v.fix} |`).join('\n')}

각 오류에는 \`path\`(프로필 안 위치), \`line\`, \`candidates\`(가까운 후보)가 있다. 후보가 있으면 그중에서 고른다.`,
};

/** 가이드를 코드(등록부·스키마·오류 표)에서 생성한다. topic을 생략하면 전체. */
export function getProfileGuide(topic?: GuideTopic): { topic: GuideTopic | 'all'; markdown: string } {
  if (topic) return { topic, markdown: SECTIONS[topic]() };
  return { topic: 'all', markdown: GUIDE_TOPICS.map((t) => SECTIONS[t]()).join('\n\n') };
}
