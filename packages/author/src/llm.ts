/**
 * LLM 포트. 제공자(LangChain 채팅 모델, 직접 SDK, 시험용 가짜)를 이 인터페이스 뒤에 숨긴다.
 * 능력 등급: A = 도구 호출 + 구조화 출력, B = 구조화 출력만, C = 일반 텍스트만.
 */
export type Capability = 'A' | 'B' | 'C';

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema (type: object) */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface LlmRequest {
  system: string;
  messages: ChatMessage[];
  /** 능력 A에서만 전달된다 */
  tools?: ToolDef[];
  /** 능력 A·B에서만 전달된다. 응답은 이 스키마의 JSON 객체(structured)여야 한다 */
  responseSchema?: { name: string; schema: Record<string, unknown> };
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  /** 모델이 낸 글(능력 C에서는 최종 답이 여기에 있다) */
  text: string;
  toolCalls: ToolCall[];
  /** responseSchema를 요청했고 모델이 따른 경우의 객체 */
  structured?: unknown;
  usage: Usage;
}

export interface LlmClient {
  /** 생성 기록에 남기는 모델 식별 (예: anthropic/claude-opus-5-5) */
  readonly id: string;
  readonly capability: Capability;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/** 시험용: 미리 정한 응답을 차례로 돌려주고, 받은 요청을 기록한다. */
export class ScriptedLlm implements LlmClient {
  readonly requests: LlmRequest[] = [];
  private i = 0;
  constructor(
    private readonly script: (Partial<LlmResponse> | ((req: LlmRequest) => Partial<LlmResponse>))[],
    readonly capability: Capability = 'A',
    readonly id = 'scripted/test',
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(structuredClone(req));
    const step = this.script[Math.min(this.i++, this.script.length - 1)];
    const r = typeof step === 'function' ? step(req) : step;
    return { text: '', toolCalls: [], usage: { inputTokens: 1000, outputTokens: 200 }, ...r };
  }
}
