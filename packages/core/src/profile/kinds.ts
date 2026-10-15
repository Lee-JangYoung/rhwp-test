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
  /** 예제를 점검할 합성 양식(templates/<이름>/template.hwpx). 생략하면 usecase */
  exampleTemplate?: string;
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

export const CLASS_SPEC = `${HEAD('class-spec')}schema: schema.json
md:
  frontMatter: meta
  collections:
    classes:
      heading: { level: 2, pattern: '{name}' }
      slots:
        - { as: kv, key: fields }
        - { as: records, key: attributes, under: 속성, optional: true }
        - { as: code, key: diagrams, lang: mermaid }
      children:
        methods:
          heading: { level: 3, pattern: '{name}' }
          slots:
            - { as: kv, key: fields }
            - { as: records, key: params, under: 파라미터, optional: true }
bindings:
  - { kind: fields, map: { meta.title: 문서명, meta.version: 버전, meta.author: 작성자, meta.date: 작성일 } }
  - kind: repeat
    over: classes
    unit: { range: { start: { table: { label: 클래스명 } }, end: { table: { headerLabel: 파라미터명 } } } }
    do:
      - { kind: cells, in: { table: { label: 클래스명 } }, map: { 클래스명: '{name}', '*': fields } }
      - kind: rows
        in: { table: { headerLabel: 속성명 } }
        over: attributes
        columns: { 속성명: '{이름}', 타입: '{타입}', 가시성: '{가시성}', 설명: '{설명}' }
      - kind: repeat
        over: methods
        onEmpty: remove
        unit: { range: { start: { table: { label: 메서드명 } }, end: { table: { headerLabel: 파라미터명 } } } }
        do:
          - { kind: cells, in: { table: { label: 메서드명 } }, map: { 메서드명: '{name}', '*': fields } }
          - kind: rows
            in: { table: { headerLabel: 파라미터명 } }
            over: params
            columns: { 파라미터명: '{이름}', 타입: '{타입}', 설명: '{설명}' }
      - { kind: diagrams, from: diagrams }
`;

export const DB_SPEC = `${HEAD('db-spec')}schema: schema.json
md:
  frontMatter: meta
  collections:
    tables:
      heading: { level: 2, pattern: '{name}' }
      slots:
        - { as: kv, key: fields }
        - { as: records, key: columns, under: 컬럼 }
        - { as: records, key: indexes, under: 인덱스, optional: true }
bindings:
  - { kind: fields, map: { meta.title: 문서명, meta.version: 버전, meta.author: 작성자, meta.date: 작성일 } }
  - kind: repeat
    over: tables
    unit: { range: { start: { table: { label: 테이블명 } }, end: { table: { headerLabel: 인덱스명 } } } }
    do:
      - { kind: cells, in: { table: { label: 테이블명 } }, map: { 테이블명: '{name}', '*': fields } }
      - kind: rows
        in: { table: { headerLabel: 컬럼명 } }
        over: columns
        columns: { 컬럼명: '{컬럼명}', 타입: '{타입}', 길이: '{길이}', 'NULL': '{NULL}', 설명: '{설명}' }
      - kind: rows
        in: { table: { headerLabel: 인덱스명 } }
        over: indexes
        columns: { 인덱스명: '{인덱스명}', 컬럼: '{컬럼}', 유니크: '{유니크}' }
      - { kind: remove, target: { table: { headerLabel: 인덱스명 } }, when: 'empty(indexes)' }
      - { kind: remove, in: { table: { label: 테이블명 } }, target: { row: { label: 비고 } }, when: 'empty(fields.비고)' }
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
    summary:
      '컬렉션의 항목 수만큼 양식 영역(표 하나, 또는 range로 시작~끝 표 묶음)을 복제하고, 복제본마다 do를 실행한다. 중첩할 수 있다(안쪽 unit은 바깥 복제본 안의 표에서 찾는다).',
    schema: binding(
      'repeat',
      {
        over: str('반복할 md 컬렉션 이름(md.collections의 키, 또는 바깥 항목의 하위 컬렉션)'),
        unit: ref(
          'locator',
          '복제할 양식 영역의 위치. 지원: { table: ... } 또는 { range: { start: {table}, end: {table} } }',
        ),
        onEmpty: {
          enum: ['error', 'remove', 'keep'],
          default: 'error',
          description: '항목이 없을 때: error=오류, remove=영역(표)을 삭제, keep=그대로',
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
    status: 'verified',
    summary:
      '표의 견본 행을 레코드 수만큼 복제해 열마다 값을 채운다(속성·메서드·컬럼 정의·개정이력). 값 표기는 cells.map과 같고 레코드의 키는 md 표의 머리글, 행 번호는 {#}.',
    schema: binding(
      'rows',
      {
        in: ref('locator', '행을 반복할 표의 위치. 생략하면 바깥 repeat의 단위(표 하나일 때)'),
        headerRows: int('머리행 수. 열 머리글은 그 마지막 머리행에서 찾는다', { default: 1, minimum: 1 }),
        templateRow: int('견본으로 쓸 데이터 행(머리행 다음 0부터)', { default: 0, minimum: 0 }),
        over: str('레코드 목록의 경로: records 슬롯(md 표의 행) 또는 컬렉션(항목마다 한 행)'),
        columns: valueMap("양식 열 머리글 → 값 표기. 레코드의 값은 '{이름}'처럼 md 표 머리글로, 행 번호는 '{#}'"),
        onEmpty: {
          enum: ['clear', 'keep', 'removeRow', 'error'],
          default: 'clear',
          description: '레코드가 없을 때: clear=견본 행을 비움, keep=그대로, removeRow=견본 행 삭제, error=오류',
        },
        unmappedValue: {
          enum: ['clear', 'keep'],
          default: 'clear',
          description: 'columns에 없는 열: clear=견본 행의 안내 문구를 비움, keep=그대로 둠',
        },
      },
      ['over', 'columns'],
    ),
    example: CLASS_SPEC,
    exampleTemplate: 'class-spec',
  },
  {
    name: 'paragraphs',
    status: 'verified',
    summary:
      '본문 문단(표식 텍스트가 든 문단)을 front-matter의 목록·서술 값으로 바꾼다. 줄마다 같은 서식의 문단이 이어진다. repeat 안에서는 쓸 수 없다(문단은 복제하지 않는다).',
    schema: binding(
      'paragraphs',
      {
        at: ref('locator', "바꿀 문단의 위치. 지원: { paragraph: { text: '표식' } } (그 텍스트가 든 첫 본문 문단)"),
        from: str('front-matter 값의 경로(예: meta.notes). 목록이면 항목마다 한 문단, 문자열이면 줄마다 한 문단'),
        format: {
          enum: ['plain', 'numbered', 'bulleted', 'lines', 'join'],
          default: 'plain',
          description: '표기 형식',
        },
        onEmpty: {
          enum: ['clear', 'keep', 'error'],
          default: 'clear',
          description: '값이 없을 때: clear=문단을 비움, keep=그대로, error=오류',
        },
      },
      ['at', 'from'],
    ),
    example: `${HEAD('report')}md:
  frontMatter: meta
  collections: {}
bindings:
  - { kind: paragraphs, at: { paragraph: { text: '{{요약}}' } }, from: meta.summary, format: bulleted }
`,
    exampleTemplate: 'report',
  },
  {
    name: 'remove',
    status: 'verified',
    summary:
      '조건에 따라 행(표의 0열 라벨 기준) 또는 표를 삭제한다(선택 항목이 없을 때). 조건: empty(경로) 또는 exists(경로). cells로 채운 뒤에 둔다.',
    schema: binding(
      'remove',
      {
        in: ref('locator', 'target이 row일 때 그 행이 있는 표. 생략하면 바깥 repeat의 단위(표 하나일 때)'),
        target: ref('locator', '삭제할 영역: { row: { label } } 또는 { table: ... }'),
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
      - { kind: cells, map: { UC ID: '{id}', 유스케이스명: '{name}', '*': fields } }
      - { kind: remove, target: { row: { label: 대안 흐름 } }, when: 'empty(alt)' }
`,
  },
  {
    name: 'text',
    status: 'verified',
    summary:
      '본문·표 셀 안의 토큰({{이름}})을 값으로 바꾼다. 문서 전체에 적용되므로 repeat 밖에서만 쓴다. 누름틀이 없는 양식에 쓴다.',
    schema: binding('text', { map: valueMap("토큰 이름 → 값 표기. 양식의 '{{이름}}'이 값으로 바뀐다") }, ['map']),
    example: `${HEAD('report')}md:
  frontMatter: meta
  collections: {}
bindings:
  - { kind: text, map: { 작성자: '{meta.author}' } }
`,
    exampleTemplate: 'report',
  },
];

export const kindByName = (name: string): KindDef | undefined => KINDS.find((k) => k.name === name);
