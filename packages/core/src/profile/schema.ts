import { KINDS, type JsonSchema } from './kinds';

const str = (description: string): JsonSchema => ({ type: 'string', description });

/** 프로필 JSON Schema. 등록부(KINDS)에서 합성하므로 새 kind가 자동으로 반영된다. */
export function buildProfileSchema(): JsonSchema {
  const slot: JsonSchema = {
    type: 'object',
    description: '항목 안에서 읽을 내용',
    properties: {
      as: {
        enum: ['kv', 'records', 'list', 'text', 'code', 'table'],
        description:
          '읽는 방식: kv=키-값 표, records=목록형 표(행 레코드), list=목록, text=서술 문단, code=코드 블록, table=표 원형',
      },
      key: str('데이터 이름(바인딩의 경로에서 쓴다)'),
      under: str('이 제목 아래의 내용만 읽는다(하위 제목 텍스트)'),
      optional: { type: 'boolean', description: '없어도 규약 위반이 아님(기본 false, code 슬롯은 true)' },
      lang: str('as가 code일 때 코드 블록 언어(예: mermaid)'),
    },
    required: ['as', 'key'],
    additionalProperties: false,
  };
  const collection: JsonSchema = {
    type: 'object',
    description: '반복되는 md 구조(예: 항목 제목 하나)',
    properties: {
      heading: {
        type: 'object',
        description: '컬렉션 항목을 나누는 제목',
        properties: {
          level: { type: 'integer', minimum: 1, maximum: 6, description: '제목 수준(1~6)' },
          pattern: str("제목 텍스트 패턴. 자리표시자로 캡처한다. 예: '{id} {name}'"),
        },
        required: ['level', 'pattern'],
        additionalProperties: false,
      },
      slots: { type: 'array', items: { $ref: '#/$defs/slot' }, description: '항목 안에서 읽을 내용(위에서부터)' },
      children: {
        type: 'object',
        description: '하위 컬렉션(이름 → 컬렉션)',
        additionalProperties: { $ref: '#/$defs/collection' },
      },
    },
    required: ['heading'],
    additionalProperties: false,
  };
  const policy = { enum: ['error', 'warn', 'ignore'], default: 'error' };
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'yangsik 문서 유형 프로필 v1',
    type: 'object',
    properties: {
      version: { const: 1, description: '프로필 형식 버전' },
      type: str('문서 유형 이름(예: usecase)'),
      name: str('사람이 읽는 이름(선택)'),
      template: str('양식 파일(HWPX). 프로필 폴더 기준 상대 경로'),
      schema: str('md 규약 JSON Schema 파일. 프로필 폴더 기준 상대 경로(선택)'),
      md: {
        type: 'object',
        description: 'md를 이름 붙은 데이터로 읽는 규칙',
        properties: {
          frontMatter: str('front-matter를 가리킬 데이터 이름(예: meta). 경로는 meta.title처럼 쓴다'),
          collections: {
            type: 'object',
            description: '컬렉션 이름 → 정의',
            additionalProperties: { $ref: '#/$defs/collection' },
          },
        },
        required: ['collections'],
        additionalProperties: false,
      },
      bindings: {
        type: 'array',
        description: '양식 위치 × 데이터 × 동작의 목록',
        items: { $ref: '#/$defs/binding' },
        minItems: 1,
      },
      output: {
        type: 'object',
        description: '출력 옵션(생략 가능)',
        properties: {
          tablePageBreak: { enum: ['none', 'table', 'cell'], default: 'cell', description: '복제한 표의 쪽 경계 나눔' },
          fitHeights: { type: 'boolean', default: true, description: '채운 뒤 표 높이를 렌더 높이로 맞춤' },
          diagram: {
            type: 'object',
            properties: {
              maxWidthHu: { type: 'integer', minimum: 1, default: 40000, description: '그림 최대 폭(HWPUNIT)' },
              scale: { type: 'integer', minimum: 1, default: 2, description: '다이어그램 렌더 배율' },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      policy: {
        type: 'object',
        description: '위반 시 동작(생략하면 모두 error)',
        properties: {
          onMissingLabel: { ...policy, description: '매핑한 라벨·위치가 양식에 없을 때' },
          onMissingField: { ...policy, description: '매핑한 누름틀이 양식에 없을 때' },
          onMissingRenderer: { ...policy, description: '다이어그램 렌더러가 없을 때' },
          onUnmappedData: { ...policy, default: 'warn', description: 'md에 있으나 어디에도 쓰이지 않은 데이터' },
        },
        additionalProperties: false,
      },
    },
    required: ['version', 'type', 'template', 'md', 'bindings'],
    additionalProperties: false,
    $defs: {
      slot,
      collection,
      locator: {
        type: 'object',
        description: '양식 안의 위치 지정(키 하나)',
        minProperties: 1,
        maxProperties: 1,
        properties: {
          table: {
            type: 'object',
            description: '표. label/headerLabel/index/text 중 하나로 찾는다',
            minProperties: 1,
            properties: {
              label: str('라벨 열에 이 텍스트가 있는 표'),
              headerLabel: str('머리행에 이 텍스트가 있는 표'),
              index: { type: 'integer', minimum: 0, description: '문서에서 n번째 표(0부터)' },
              text: str('표 안 어딘가에 이 텍스트가 있는 표'),
              column: { type: 'integer', minimum: 0, description: 'label을 찾을 열(기본 0)' },
            },
            additionalProperties: false,
          },
          range: {
            type: 'object',
            description:
              '시작 표~끝 표 사이의 표 전부(repeat.unit에서 지원: 표 묶음을 통째로 복제). start·end는 table 위치 지정',
            properties: { start: { $ref: '#/$defs/locator' }, end: { $ref: '#/$defs/locator' } },
            required: ['start', 'end'],
            additionalProperties: false,
          },
          paragraph: {
            type: 'object',
            description: '문단(미지원)',
            minProperties: 1,
            properties: {
              text: str('이 텍스트가 있는 문단'),
              style: str('이 스타일의 문단'),
              bookmark: str('이 책갈피가 있는 문단'),
            },
            additionalProperties: false,
          },
          row: {
            type: 'object',
            description: '표 안의 행(미지원)',
            properties: { label: str('라벨 열에 이 텍스트가 있는 행') },
            required: ['label'],
            additionalProperties: false,
          },
          field: str('누름틀 이름'),
          bookmark: str('책갈피 이름'),
        },
        additionalProperties: false,
      },
      valueSpec: {
        description: "값 표기: 자리표시자 문자열('{id}') 또는 { from, format, default }",
        oneOf: [
          { type: 'string' },
          {
            type: 'object',
            properties: {
              from: str('데이터 경로(반복 안에서는 그 항목 기준)'),
              format: {
                enum: ['plain', 'numbered', 'bulleted', 'lines', 'join'],
                default: 'plain',
                description: '목록 표기 형식',
              },
              default: str('값이 없을 때 쓸 문자열'),
            },
            required: ['from'],
            additionalProperties: false,
          },
        ],
      },
      binding: { discriminator: { propertyName: 'kind' }, oneOf: KINDS.map((k) => k.schema) },
    },
  };
}
