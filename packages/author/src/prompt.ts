import { buildProfileSchema, describeKinds, getProfileGuide, type TemplateFacts } from '@yangsik/core';
import type { ToolDef } from './llm';

/** 프롬프트·도구 정의의 버전. 생성 기록에 남긴다. 내용을 바꾸면 올린다 */
export const PROMPT_VERSION = 'author-1';

type Json = Record<string, unknown>;

/** 응답 스키마: { profile, rationale[] }. 프로필 스키마의 $defs를 루트로 올려 $ref가 유지되게 한다 */
export function buildResponseSchema(): Json {
  const { $schema: _s, $id: _i, $defs, ...profile } = buildProfileSchema() as unknown as Json & { $defs?: Json };
  return {
    type: 'object',
    required: ['profile'],
    additionalProperties: false,
    properties: {
      profile,
      rationale: {
        type: 'array',
        description:
          '바인딩마다 왜 그렇게 연결했는지. evidence에는 양식 라벨 텍스트나 예제 md의 문구를 그대로 인용한다',
        items: {
          type: 'object',
          required: ['path', 'why'],
          additionalProperties: false,
          properties: {
            path: { type: 'string', description: '프로필 안 위치 (예: bindings[1].do[0])' },
            why: { type: 'string' },
            confidence: { enum: ['high', 'medium', 'low'] },
            evidence: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    ...($defs ? { $defs } : {}),
  };
}

const RULES = `당신은 SI 산출물 변환 도구의 "프로필" 작성자입니다. 프로필은 Markdown을 HWPX 양식에 넣는 방법을 정한 YAML입니다.

규칙
- 양식의 라벨·누름틀 이름·표 위치는 "양식 사실(JSON)"에 있는 것만, 공백·철자까지 그대로 씁니다. 추측하거나 만들어 내지 않습니다.
- 사용할 수 있는 kind는 가이드의 "사용 가능" 항목뿐입니다.
- md 규칙(md.collections)은 "예제 md"의 구조를 읽어 정합니다. 제목 패턴, 슬롯(kv/records/list/text/code)과 under(하위 제목 텍스트)를 예제와 맞춥니다.
- 모르는 값은 비우거나 생략합니다. 알 수 없는 키를 쓰지 않습니다.
- 점검 오류가 주어지면 code·path·candidates를 읽고 해당 부분만 고칩니다.
- 근거(rationale)의 evidence는 양식 사실이나 예제 md에 실제로 있는 문구만 인용합니다.`;

export function buildSystemPrompt(): string {
  const guide = getProfileGuide().markdown;
  return `${RULES}\n\n---\n\n${guide}`;
}

export interface UserPromptInput {
  typeName?: string;
  hint?: string;
  facts: TemplateFacts;
  exampleMd: string;
  dataSchema?: object;
  /** 능력 C(텍스트만)일 때 출력 형식 안내를 덧붙인다 */
  textOnly?: boolean;
}

export function buildUserPrompt(i: UserPromptInput): string {
  const parts = [
    `문서 유형: ${i.typeName ?? '(미지정)'}`,
    ...(i.hint ? [`작성자 설명: ${i.hint}`] : []),
    `## 양식 사실 (JSON)\n\`\`\`json\n${JSON.stringify(i.facts, null, 1)}\n\`\`\``,
    `## 예제 md\n\`\`\`markdown\n${i.exampleMd}\n\`\`\``,
    ...(i.dataSchema ? [`## md 규약 (JSON Schema)\n\`\`\`json\n${JSON.stringify(i.dataSchema, null, 1)}\n\`\`\``] : []),
    '위 양식에 예제 md를 넣는 프로필을 작성하세요. 프로필과 근거(rationale)를 함께 냅니다.',
  ];
  if (i.textOnly)
    parts.push(
      '출력 형식: JSON 객체 하나만 출력하세요. `{ "profile": { ... }, "rationale": [ ... ] }` (설명 문장 없이, 코드 블록은 써도 됩니다).',
    );
  return parts.join('\n\n');
}

/** 능력 A에서 모델이 다시 조회할 수 있는 도구 (코어의 같은 함수를 부른다) */
export const TOOLS: ToolDef[] = [
  {
    name: 'analyze_template',
    description: '양식의 사실(표·라벨·머리글·누름틀)을 다시 조회한다',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'describe_kinds',
    description: '쓸 수 있는 동작(kind) 목록과 키 스키마, 예시',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_guide',
    description: '작성 가이드의 한 주제를 조회한다',
    parameters: {
      type: 'object',
      properties: { topic: { enum: ['overview', 'minimal', 'keys', 'kinds', 'locators', 'paths', 'errors'] } },
    },
  },
  {
    name: 'check_profile',
    description: '프로필 YAML을 점검한다. 오류(code, path, candidates)를 돌려준다',
    parameters: { type: 'object', required: ['profile_yaml'], properties: { profile_yaml: { type: 'string' } } },
  },
  {
    name: 'preview_mapping',
    description: '프로필 YAML과 예제 md로 양식 라벨 ↔ md 값 대조표를 만든다',
    parameters: { type: 'object', required: ['profile_yaml'], properties: { profile_yaml: { type: 'string' } } },
  },
];

export const kindsForPrompt = () => describeKinds();
