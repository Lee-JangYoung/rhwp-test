/**
 * 동작(kind) 등록부. 새 패턴은 여기에 kind를 추가해 지원한다(형식 버전은 올리지 않는다).
 * - `status: 'verified'`: rhwp에서 동작을 확인했고 변환에 쓸 수 있다.
 * - `status: 'defined'`: 형식은 정의했지만 아직 검증하지 않아 checkProfile이 거부한다.
 * 스키마·가이드·점검이 모두 이 등록부에서 만들어지므로 구현과 어긋나지 않는다.
 */
export type JsonSchema = Record<string, unknown>;

export interface KindDef {
  name: string;
  status: 'verified' | 'defined';
  summary: string;
  /** 이 kind의 바인딩 스키마(`kind` const 포함) */
  schema: JsonSchema;
  /** 완전한 프로필 YAML 예제. 시험에서 스키마(와 verified면 점검)를 통과해야 한다 */
  example: string;
}

const str = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: 'string', description, ...extra });
const int = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: 'integer', description, ...extra });
const ref = (name: string, description?: string): JsonSchema => ({
  $ref: `#/$defs/${name}`,
  ...(description ? { description } : {}),
});
const idProp = str('바인딩 이름(선택). 오류 메시지와 대화에서 가리키는 용도');

const binding = (kind: string, properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: 'object',
  properties: { kind: { const: kind, description: '동작 종류' }, id: idProp, ...properties },
  required: ['kind', ...required],
  additionalProperties: false,
});

const valueMap = (description: string): JsonSchema => ({
  type: 'object',
  description,
  additionalProperties: ref('valueSpec'),
});

// ---- 예제 공통 조각 -------------------------------------------------------
const USECASE_MD = `md:
  frontMatter: meta
  collections:
    items:
      heading: { level: 2, pattern: '{id} {name}' }
      slots:
        - { as: kv, key: fields }
        - { as: list, key: main, under: 기본 흐름 }
        - { as: list, key: alt, under: 대안 흐름, optional: true }
        - { as: code, key: diagrams, lang: mermaid }`;
const HEAD = (type: string) => `version: 1
type: ${type}
template: template.hwpx
`;

export const MINIMAL_USECASE = `${HEAD('usecase')}schema: schema.json
${USECASE_MD}
bindings:
  - { kind: fields, map: { meta.title: 문서명, meta.version: 버전, meta.author: 작성자, meta.date: 작성일 } }
  - kind: repeat
    over: items
    unit: { table: { label: UC ID } }
    do:
      - kind: cells
        map:
          UC ID: '{id}'
          유스케이스명: '{name}'
          기본 흐름: { from: main, format: numbered }
          대안 흐름: { from: alt, format: numbered }
          '*': fields
      - { kind: diagrams, from: diagrams }
`;

export const KINDS: KindDef[] = [
  {
    name: 'fields',
    status: 'verified',
    summary: '양식의 누름틀에 값을 채운다. 표지·문서 정보에 쓴다.',
    schema: binding(
      'fields',
      {
        map: {
          type: 'object',
          description: 'md 데이터 경로 → 양식 누름틀 이름',
          additionalProperties: str('양식의 누름틀 이름'),
        },
      },
      ['map'],
    ),
    example: `${HEAD('usecase')}${USECASE_MD}
bindings:
  - { kind: fields, map: { meta.title: 문서명, meta.date: 작성일 } }
`,
  },
  {
    name: 'cells',
    status: 'verified',
    summary: '표에서 라벨 셀 옆(오른쪽 또는 아래) 값 셀에 단일 값을 채운다. 항목 헤더 표에 쓴다.',
    schema: binding(
      'cells',
      {
        in: ref('locator', '값을 채울 표의 위치. 생략하면 바깥 repeat의 단위(표) 자체'),
        labelColumn: int('라벨이 있는 열(0부터)', { default: 0, minimum: 0 }),
        valueColumn: int('값 셀이 있는 열(0부터). value가 right일 때', { default: 1, minimum: 0 }),
        value: { enum: ['right', 'below'], default: 'right', description: '값 셀의 위치: 라벨의 오른쪽 또는 아래' },
        map: valueMap("양식 라벨 → 값. 키 '*'는 값 슬롯(kv)의 나머지 항목을 같은 이름의 라벨로 채운다"),
        unmappedValue: {
          enum: ['clear', 'keep'],
          default: 'clear',
          description: '값이 없는 라벨: clear=양식 안내 문구를 비움, keep=그대로 둠',
        },
      },
      ['map'],
    ),
    example: `${HEAD('usecase')}${USECASE_MD}
bindings:
  - kind: repeat
    over: items
    unit: { table: { label: UC ID } }
    do:
      - kind: cells
        map: { UC ID: '{id}', 유스케이스명: '{name}', '*': fields }
`,
  },
  {
    name: 'repeat',
    status: 'verified',
    summary: '컬렉션의 항목 수만큼 양식 영역(현재 지원: 표 하나)을 복제하고, 복제본마다 do를 실행한다. 중첩할 수 있다.',
    schema: binding(
      'repeat',
      {
        over: str('반복할 md 컬렉션 이름(md.collections의 키, 또는 바깥 항목의 하위 컬렉션)'),
        unit: ref('locator', '복제할 양식 영역의 위치. 현재 지원: { table: ... }'),
        onEmpty: {
          enum: ['error', 'remove', 'keep'],
          default: 'error',
          description: '항목이 없을 때: error=오류, remove=영역 삭제(미지원), keep=그대로',
        },
        do: {
          type: 'array',
          description: '복제본마다 실행할 바인딩(이 안의 경로는 그 항목 기준)',
          items: ref('binding'),
          minItems: 1,
        },
      },
      ['over', 'unit', 'do'],
    ),
    example: MINIMAL_USECASE,
  },
  {
    name: 'diagrams',
    status: 'verified',
    summary: '코드 블록(mermaid)을 이미지로 렌더해 단위 뒤에 삽입한다.',
    schema: binding(
      'diagrams',
      {
        from: str('다이어그램 코드를 담은 code 슬롯의 키'),
        place: {
          enum: ['afterUnit', 'atMarker'],
          default: 'afterUnit',
          description: '삽입 위치: afterUnit=복제된 단위 바로 뒤, atMarker=at 위치(미지원)',
        },
        at: ref('locator', 'place가 atMarker일 때의 위치'),
      },
      ['from'],
    ),
    example: MINIMAL_USECASE,
  },
  {
    name: 'rows',
    status: 'defined',
    summary:
      '표의 견본 행을 레코드 수만큼 복제해 열마다 값을 채운다(속성·메서드·컬럼 정의·개정이력). 행 복제 후 셀 채움은 미검증(I-5).',
    schema: binding(
      'rows',
      {
        in: ref('locator', '행을 반복할 표의 위치'),
        headerRows: int('머리행 수', { default: 1, minimum: 0 }),
        templateRow: int('견본으로 쓸 데이터 행(머리행 다음 0부터)', { default: 0, minimum: 0 }),
        over: str('레코드 목록의 경로(records 슬롯)'),
        columns: { type: 'object', description: '양식 열 머리글 → 레코드 키', additionalProperties: str('레코드 키') },
      },
      ['in', 'over', 'columns'],
    ),
    example: `${HEAD('class-spec')}md:
  collections:
    classes:
      heading: { level: 2, pattern: '{name}' }
      slots:
        - { as: kv, key: fields }
        - { as: records, key: attributes, under: 속성 }
bindings:
  - kind: repeat
    over: classes
    unit: { table: { label: 클래스명 } }
    do:
      - { kind: cells, map: { 클래스명: '{name}', '*': fields } }
      - kind: rows
        in: { table: { headerLabel: 속성명 } }
        over: attributes
        columns: { 속성명: name, 타입: type, 설명: desc }
`,
  },
  {
    name: 'paragraphs',
    status: 'defined',
    summary: '문단(또는 문단 묶음)을 목록·서술 수만큼 채우거나 복제한다(서술형 절, 번호 목록 본문). 미검증.',
    schema: binding(
      'paragraphs',
      {
        at: ref('locator', '채울 문단의 위치'),
        from: str('목록·서술 슬롯의 경로'),
        format: {
          enum: ['plain', 'numbered', 'bulleted', 'lines', 'join'],
          default: 'plain',
          description: '표기 형식',
        },
      },
      ['at', 'from'],
    ),
    example: `${HEAD('design-doc')}md:
  collections:
    sections:
      heading: { level: 2, pattern: '{title}' }
      slots:
        - { as: text, key: body }
bindings:
  - kind: repeat
    over: sections
    unit: { paragraph: { style: 절제목 } }
    do:
      - { kind: paragraphs, at: { paragraph: { style: 본문 } }, from: body }
`,
  },
  {
    name: 'remove',
    status: 'defined',
    summary: '조건에 따라 영역(행·표 등)을 삭제한다(선택 항목이 없을 때). 미검증.',
    schema: binding(
      'remove',
      {
        target: ref('locator', '삭제할 영역의 위치'),
        when: str('조건: empty(경로) 또는 exists(경로)', { pattern: '^(empty|exists)\\(.+\\)$' }),
      },
      ['target', 'when'],
    ),
    example: `${HEAD('usecase')}${USECASE_MD}
bindings:
  - kind: repeat
    over: items
    unit: { table: { label: UC ID } }
    do:
      - { kind: remove, target: { row: { label: 대안 흐름 } }, when: 'empty(alt)' }
`,
  },
  {
    name: 'text',
    status: 'defined',
    summary: '문단 안의 토큰({{경로}})을 값으로 치환한다. 미검증(replaceOne은 표 셀에서 동작하지 않음).',
    schema: binding('text', { in: ref('locator', '토큰을 찾을 영역'), map: valueMap('토큰 이름 → 값') }, ['map']),
    example: `${HEAD('report')}md:
  frontMatter: meta
  collections: {}
bindings:
  - { kind: text, map: { 작성자: meta.author } }
`,
  },
];

export const kindByName = (name: string): KindDef | undefined => KINDS.find((k) => k.name === name);
