// 독립 검토(S-29)에서 재현된 결함의 회귀 시험: LLM 응답은 신뢰할 수 없는 입력이다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rhwpEngine } from '@yangsik/core/node';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  type GenerateInput,
  generateProfile,
  langChainClient,
  previewPrompt,
  reviewToMarkdown,
  ScriptedLlm,
} from '../src/index';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const USECASE = at('../../../templates/usecase');
const GOOD = readFileSync(join(USECASE, 'profile.yaml'), 'utf8');
const input: GenerateInput = {
  engine: rhwpEngine,
  template: new Uint8Array(readFileSync(join(USECASE, 'template.hwpx'))),
  exampleMd: readFileSync(join(USECASE, 'example.md'), 'utf8'),
  dataSchema: JSON.parse(readFileSync(join(USECASE, 'schema.json'), 'utf8')) as object,
};
const draft = (yaml: string, rationale: unknown = []) => ({ structured: { profile: YAML.parse(yaml), rationale } });

describe('LLM 응답 검증', () => {
  it('YAML 별칭 폭탄은 예외 없이 실패한 시도로 기록되고 다음 시도로 이어진다', async () => {
    const levels = ['a: &a [x, x, x, x, x, x, x, x, x]'];
    let prev = 'a';
    for (const n of 'bcdefghij') {
      levels.push(`${n}: &${n} [${Array(9).fill(`*${prev}`).join(', ')}]`);
      prev = n;
    }
    const bomb = `\`\`\`yaml\n${levels.join('\n')}\n\`\`\``;
    const llm = new ScriptedLlm([{ text: bomb }, draft(GOOD)]);
    const r = await generateProfile(input, { llm, allowSend: true });
    expect(r.ok).toBe(true);
    expect(r.attempts).toHaveLength(2);
    expect(r.attempts[0].issues[0].code).toBe('yaml-syntax');
  });

  it('모양이 맞지 않는 rationale이어도 보고서가 만들어진다', async () => {
    const llm = new ScriptedLlm([
      draft(GOOD, [
        null,
        { path: 'x' },
        { path: 'p', why: 'a\n| b |', evidence: '문자열' },
        { path: 'q', why: '좋음', evidence: ['', 'x', 'UC ID'] },
        7,
      ]),
    ]);
    const r = await generateProfile(input, { llm, allowSend: true });
    expect(r.ok).toBe(true);
    expect(r.review.rationale.map((x) => x.path)).toEqual(['p', 'q']);
    // 한 글자·빈 인용은 확인되지 않은 것으로 본다
    expect(r.review.rationale[1].unverifiedEvidence).toEqual(['', 'x']);
    const md = reviewToMarkdown(r.review, r.yaml);
    expect(md).not.toContain('a\n| b |');
    expect(md).toContain('a ⏎ \\| b \\|');
  });

  it('모델 호출이 실패하면 그때까지의 시도·토큰·초안을 남기고 llm-error로 멈춘다', async () => {
    let n = 0;
    const llm: ScriptedLlm = new ScriptedLlm([]);
    llm.complete = async () => {
      if (n++ === 0)
        return {
          text: '',
          toolCalls: [],
          structured: { profile: YAML.parse(GOOD.replace('유스케이스명:', '유스케이스 이름:')) },
          usage: { inputTokens: 500, outputTokens: 50 },
        };
      throw new Error('401 invalid api key');
    };
    const r = await generateProfile(input, { llm, allowSend: true });
    expect(r.stopReason).toBe('llm-error');
    expect(r.error).toContain('401');
    expect(r.attempts).toHaveLength(2);
    expect(r.usage.inputTokens).toBe(500);
    expect(r.yaml).toBeDefined(); // 첫 초안은 남는다
  });

  it('생성된 프로필의 template·schema는 프로필 폴더의 고정 이름이어야 한다 (임의 경로 금지)', async () => {
    const evil = GOOD.replace('template: template.hwpx', 'template: /etc/passwd').replace(
      'schema: schema.json',
      'schema: ../../../../root/.ssh/config',
    );
    const llm = new ScriptedLlm([draft(evil), draft(GOOD)]);
    const r = await generateProfile(input, { llm, allowSend: true });
    expect(r.attempts[0].issues.map((i) => i.path)).toEqual(expect.arrayContaining(['template', 'schema']));
    expect(r.ok).toBe(true);
    expect(r.profile?.template).toBe('template.hwpx');
    // 규약이 없는데 schema를 쓰면 거부
    const noSchema = await generateProfile(
      { ...input, dataSchema: undefined },
      { llm: new ScriptedLlm([draft(GOOD)]), allowSend: true, maxIterations: 1 },
    );
    expect(noSchema.attempts[0].issues.some((i) => i.path === 'schema')).toBe(true);
  });
});

describe('비용 상한', () => {
  const tool = { id: 't', name: 'analyze_template', args: {} };
  it('도구 호출 반복 중에도 토큰 상한을 지킨다', async () => {
    const llm = new ScriptedLlm([{ toolCalls: [tool], usage: { inputTokens: 100_000, outputTokens: 0 } }]);
    const r = await generateProfile(input, { llm, allowSend: true, maxTotalTokens: 150_000, maxToolRounds: 8 });
    expect(r.stopReason).toBe('token-limit');
    expect(llm.requests.length).toBeLessThanOrEqual(2);
  });

  it('사용량이 0·NaN이면 글자 수로 어림해 상한이 작동한다', async () => {
    for (const usage of [
      { inputTokens: 0, outputTokens: 0 },
      { inputTokens: Number.NaN, outputTokens: Number.NaN },
    ]) {
      const llm = new ScriptedLlm([{ ...draft(GOOD.replace('유스케이스명:', '유스케이스 이름:')), usage }]);
      const r = await generateProfile(input, { llm, allowSend: true, maxTotalTokens: 1 });
      expect(r.stopReason).toBe('token-limit');
      expect(llm.requests).toHaveLength(1);
      expect(r.usage.inputTokens).toBeGreaterThan(0);
    }
  });

  it('한 응답의 병렬 도구 호출은 8개까지만 실행한다', async () => {
    const llm = new ScriptedLlm([
      { toolCalls: Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, name: 'describe_kinds', args: {} })) },
      draft(GOOD),
    ]);
    const r = await generateProfile(input, { llm, allowSend: true });
    expect(r.ok).toBe(true);
    expect(r.attempts[0].toolCalls).toBe(8);
  });

  it('allowSend는 true일 때만 허용한다 ("false" 같은 truthy 값은 거부)', async () => {
    const llm = new ScriptedLlm([draft(GOOD)]);
    const r = await generateProfile(input, { llm, allowSend: 'false' as unknown as boolean });
    expect(r.stopReason).toBe('not-allowed');
    expect(llm.requests).toHaveLength(0);
  });

  it('get_guide 도구는 알 수 없는 주제(constructor)에 오류 JSON을 준다', async () => {
    const llm = new ScriptedLlm([
      { toolCalls: [{ id: 'g', name: 'get_guide', args: { topic: 'constructor' } }] },
      draft(GOOD),
    ]);
    await generateProfile(input, { llm, allowSend: true });
    const tool = llm.requests[1].messages.find((m) => m.role === 'tool');
    expect(tool && 'content' in tool && JSON.parse(tool.content).error).toContain('주제');
  });
});

describe('전송 범위와 추적', () => {
  it('미리보기의 포함·제외 문구가 실제 전송 범위와 맞고, 전체 셀 텍스트(texts)는 보내지 않는다', async () => {
    const p = await previewPrompt(input, 'A');
    expect(p.contains.join(' ')).toContain('본문 문단 앞 60개');
    expect(p.excludes.join(' ')).not.toContain('양식 본문 전체');
    expect(p.user).not.toContain('"texts"');
  });

  it('LangChain 추적 환경변수가 켜져 있으면 클라이언트 생성을 거부하고, 명시 허용하면 쓴다', async () => {
    const { FakeListChatModel } = await import('@langchain/core/utils/testing');
    const model = new FakeListChatModel({ responses: ['x'] });
    const saved = process.env.LANGSMITH_TRACING;
    process.env.LANGSMITH_TRACING = 'true';
    try {
      expect(() => langChainClient(model, { id: 'f', capability: 'C' })).toThrow(/LangSmith/);
      expect(() => langChainClient(model, { id: 'f', capability: 'C', allowTracing: true })).not.toThrow();
    } finally {
      if (saved === undefined) delete process.env.LANGSMITH_TRACING;
      else process.env.LANGSMITH_TRACING = saved;
    }
  });
});
