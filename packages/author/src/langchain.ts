import { AIMessage, type BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Capability, ChatMessage, LlmClient, LlmRequest, LlmResponse } from './llm';

/** @langchain/core가 "true"로 보고 추적(LangSmith 전송)을 자동으로 켜는 환경변수 */
const TRACING_ENV = ['LANGSMITH_TRACING', 'LANGSMITH_TRACING_V2', 'LANGCHAIN_TRACING', 'LANGCHAIN_TRACING_V2'];

export interface LangChainOptions {
  /** 추적 환경변수가 켜져 있어도 쓴다(프롬프트가 외부 서비스로 간다). 기본 false */
  allowTracing?: boolean;
  /** 생성 기록에 남기는 식별 (예: anthropic/claude-opus-5-5) */
  id: string;
  /** 모델이 지원하는 등급. 지정해야 한다 (자동 판정은 실제 모델 스파이크 후) */
  capability: Capability;
}

function toLc(messages: ChatMessage[]): BaseMessage[] {
  return messages.map((m) => {
    if (m.role === 'user') return new HumanMessage(m.content);
    if (m.role === 'tool') return new ToolMessage({ content: m.content, tool_call_id: m.toolCallId, name: m.name });
    return new AIMessage({
      content: m.content,
      tool_calls: m.toolCalls?.map((c) => ({ id: c.id, name: c.name, args: c.args, type: 'tool_call' as const })),
    });
  });
}

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((p) => (typeof p === 'string' ? p : ((p as { text?: string }).text ?? ''))).join('')
      : '';

function usageOf(m: AIMessage) {
  const u = m.usage_metadata;
  return { inputTokens: u?.input_tokens ?? 0, outputTokens: u?.output_tokens ?? 0 };
}

/**
 * LangChain 채팅 모델(`BaseChatModel`)을 LlmClient로 감싼다. 제공자 패키지(@langchain/anthropic 등)는
 * 호출 측이 설치·생성해 넘긴다. 이 파일은 @langchain/core의 공통 인터페이스만 쓴다.
 * 실제 모델별 동작(도구 호출·구조화 출력 방식)은 모델마다 달라 스파이크로 확인한다.
 */
export function langChainClient(model: BaseChatModel, o: LangChainOptions): LlmClient {
  const tracing = TRACING_ENV.filter((k) => process.env[k] === 'true');
  if (tracing.length && !o.allowTracing)
    throw new Error(
      `추적 환경변수(${tracing.join(', ')})가 켜져 있어 프롬프트(양식 사실·예제 md)가 LangSmith로 전송될 수 있음. 환경변수를 끄거나 allowTracing: true로 명시 허용하세요.`,
    );
  return {
    id: o.id,
    capability: o.capability,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const messages = [new SystemMessage(req.system), ...toLc(req.messages)];
      // 도구와 구조화 출력은 함께 쓰지 않는다: 도구가 있으면 도구를 묶고, 최종 답은 텍스트(JSON)로 받는다
      if (req.tools?.length) {
        if (!model.bindTools) throw new Error('이 모델은 bindTools를 지원하지 않음 (능력 B 또는 C로 지정하세요)');
        const bound = model.bindTools(
          req.tools.map((t) => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        );
        const ai = (await bound.invoke(messages)) as AIMessage;
        return {
          text: textOf(ai.content),
          toolCalls: (ai.tool_calls ?? []).map((c, i) => ({
            id: c.id ?? `call_${i}`,
            name: c.name,
            args: c.args as Record<string, unknown>,
          })),
          usage: usageOf(ai),
        };
      }
      if (req.responseSchema) {
        const structured = model.withStructuredOutput<Record<string, unknown>>(req.responseSchema.schema, {
          name: req.responseSchema.name,
          includeRaw: true,
        });
        const out = (await structured.invoke(messages)) as { raw: AIMessage; parsed: Record<string, unknown> | null };
        return {
          text: textOf(out.raw?.content),
          toolCalls: [],
          structured: out.parsed ?? undefined,
          usage: out.raw ? usageOf(out.raw) : { inputTokens: 0, outputTokens: 0 },
        };
      }
      const ai = (await model.invoke(messages)) as AIMessage;
      return { text: textOf(ai.content), toolCalls: [], usage: usageOf(ai) };
    },
  };
}
