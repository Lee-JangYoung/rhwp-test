import {
  analyzeTemplate,
  checkProfile,
  describeKinds,
  type DiagramRenderer,
  type DocumentEngine,
  getProfileGuide,
  type GuideTopic,
  type Issue,
  type Profile,
  parseProfile,
  previewMapping,
  type ProfileTestResult,
  readMarkdown,
  type TemplateFacts,
  testProfile,
} from '@yangsik/core';
import YAML from 'yaml';
import type { ChatMessage, LlmClient, LlmRequest, LlmResponse, ToolCall, ToolDef, Usage } from './llm';
import { buildResponseSchema, buildSystemPrompt, buildUserPrompt, PROMPT_VERSION, TOOLS } from './prompt';
import { buildReview, type Rationale, type ReviewReport } from './review';

export interface GenerateInput {
  engine: DocumentEngine;
  /** 양식 HWPX. 바이너리는 LLM에 보내지 않고 분석 사실만 보낸다 */
  template: Uint8Array;
  exampleMd: string;
  dataSchema?: object;
  typeName?: string;
  /** 작성자가 LLM에 주는 설명 (선택) */
  hint?: string;
  renderDiagram?: DiagramRenderer;
}

export interface GenerateOptions {
  llm: LlmClient;
  /** 양식 사실과 예제 md가 LLM 제공자로 전송되는 것을 허용한다. true가 아니면 호출하지 않는다 (D15) */
  allowSend: boolean;
  /** 점검 루프 최대 반복 (기본 5, D18) */
  maxIterations?: number;
  /** 입력+출력 토큰 합계 상한 (기본 400000). 넘으면 현재 초안과 오류를 보고하고 멈춘다 */
  maxTotalTokens?: number;
  /** 한 번의 시도 안에서 도구를 부를 수 있는 최대 횟수 (기본 8) */
  maxToolRounds?: number;
}

export interface Attempt {
  n: number;
  yaml?: string;
  /** 초안을 얻지 못한 이유 */
  draftError?: string;
  issues: Issue[];
  dryRun?: { ok: boolean; failedChecks: string[]; violations: number; issues: number };
  toolCalls: number;
  usage: Usage;
}

export type StopReason = 'passed' | 'max-iterations' | 'token-limit' | 'no-draft' | 'not-allowed';

export interface GenerateResult {
  ok: boolean;
  stopReason: StopReason;
  /** 마지막 초안(통과하지 못했어도 남긴다) */
  yaml?: string;
  profile?: Profile;
  attempts: Attempt[];
  usage: Usage;
  review: ReviewReport;
}

export interface PromptPreview {
  promptVersion: string;
  capability: LlmClient['capability'];
  system: string;
  user: string;
  tools: ToolDef[];
  responseSchema?: Record<string, unknown>;
  /** 전송되는 글자 수 합계(대략) */
  chars: number;
  /** 전송에 포함되는 것 / 포함되지 않는 것 */
  contains: string[];
  excludes: string[];
}

const sum = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

/** LLM에 실제로 보낼 내용을 미리 만든다(보내지 않는다). HWPX 바이너리는 포함되지 않는다. */
export async function previewPrompt(input: GenerateInput, capability: LlmClient['capability']): Promise<PromptPreview> {
  const facts = await analyzeTemplate(input.engine, input.template);
  return previewFrom(input, facts, capability);
}

function previewFrom(input: GenerateInput, facts: TemplateFacts, capability: LlmClient['capability']): PromptPreview {
  const system = buildSystemPrompt();
  const user = buildUserPrompt({
    typeName: input.typeName,
    hint: input.hint,
    facts,
    exampleMd: input.exampleMd,
    dataSchema: input.dataSchema,
    textOnly: capability !== 'B',
  });
  const tools = capability === 'A' ? TOOLS : [];
  const responseSchema = capability === 'C' ? undefined : buildResponseSchema();
  const chars =
    system.length + user.length + JSON.stringify(tools).length + JSON.stringify(responseSchema ?? {}).length;
  return {
    promptVersion: PROMPT_VERSION,
    capability,
    system,
    user,
    tools,
    responseSchema,
    chars,
    contains: [
      '작성 가이드',
      '양식 사실(표·라벨·머리글·누름틀 이름)',
      '예제 md 전문',
      ...(input.dataSchema ? ['md 규약(JSON Schema)'] : []),
    ],
    excludes: ['HWPX 파일 바이너리', '양식 본문 전체', 'API 키·환경변수'],
  };
}

/** 모델 응답에서 { profile(YAML 텍스트), rationale }를 꺼낸다 */
export function extractDraft(res: Pick<LlmResponse, 'text' | 'structured'>): {
  yaml?: string;
  rationale?: Rationale[];
  error?: string;
} {
  const fromObject = (o: unknown): { yaml?: string; rationale?: Rationale[]; error?: string } => {
    if (!o || typeof o !== 'object') return { error: '응답이 객체가 아님' };
    const obj = o as Record<string, unknown>;
    const profile = 'profile' in obj ? obj.profile : 'bindings' in obj ? obj : undefined;
    if (profile === undefined) return { error: '응답에 profile이 없음' };
    const rationale = Array.isArray(obj.rationale) ? (obj.rationale as Rationale[]) : undefined;
    return { yaml: typeof profile === 'string' ? profile : YAML.stringify(profile), rationale };
  };
  if (res.structured !== undefined && res.structured !== null) return fromObject(res.structured);
  const text = res.text.trim();
  const fence = /```(json|yaml|yml)?\s*\n([\s\S]*?)```/.exec(text);
  const body = fence ? fence[2].trim() : text;
  if (fence && (fence[1] === 'yaml' || fence[1] === 'yml')) return { yaml: body };
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return { error: '응답에서 JSON 객체를 찾지 못함' };
  try {
    return fromObject(JSON.parse(body.slice(start, end + 1)));
  } catch (e) {
    return { error: `JSON 해석 실패: ${(e as Error).message}` };
  }
}

/** 도구 호출을 코어의 같은 함수로 실행한다. 결과는 JSON 문자열 */
async function runTool(call: ToolCall, input: GenerateInput, facts: TemplateFacts): Promise<string> {
  const yamlOf = () => String(call.args.profile_yaml ?? '');
  try {
    switch (call.name) {
      case 'analyze_template':
        return JSON.stringify(facts);
      case 'describe_kinds':
        return JSON.stringify(describeKinds());
      case 'get_guide':
        return getProfileGuide(call.args.topic as GuideTopic | undefined).markdown;
      case 'check_profile': {
        const p = parseProfile(yamlOf());
        if (!p.profile) return JSON.stringify({ ok: false, issues: p.issues });
        const r = await checkProfile(input.engine, p.profile, input.template, {
          lineOf: p.lineOf,
          dataSchema: input.dataSchema,
        });
        return JSON.stringify(r);
      }
      case 'preview_mapping': {
        const p = parseProfile(yamlOf());
        if (!p.profile) return JSON.stringify({ ok: false, issues: p.issues });
        return JSON.stringify(await previewMapping(input.engine, p.profile, input.exampleMd, input.template));
      }
      default:
        return JSON.stringify({ error: `알 수 없는 도구: ${call.name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message });
  }
}

const brief = (issues: Issue[]) =>
  issues.slice(0, 30).map(({ code, severity, path, line, message, candidates, id }) => ({
    code,
    severity,
    path,
    line,
    message,
    candidates,
    id,
  }));

/**
 * 프로필 생성 루프: 초안(LLM) → parseProfile·checkProfile → 드라이런 → 오류를 되돌려 수정, 통과하거나 상한까지.
 * 품질 게이트(점검·드라이런)는 코어가 하고 LLM 제공자와 무관하다.
 */
export async function generateProfile(input: GenerateInput, opts: GenerateOptions): Promise<GenerateResult> {
  const { llm } = opts;
  const facts = await analyzeTemplate(input.engine, input.template);
  const maxIter = opts.maxIterations ?? 5;
  const maxTokens = opts.maxTotalTokens ?? 400_000;
  const maxTools = opts.maxToolRounds ?? 8;
  const attempts: Attempt[] = [];
  let total: Usage = { inputTokens: 0, outputTokens: 0 };
  let last:
    | { yaml: string; profile?: Profile; rationale?: Rationale[]; test?: ProfileTestResult; issues: Issue[] }
    | undefined;
  let stop: StopReason = 'max-iterations';

  const finish = (): GenerateResult => {
    const review = buildReview({
      llmId: llm.id,
      capability: llm.capability,
      promptVersion: PROMPT_VERSION,
      stopReason: stop,
      attempts,
      usage: total,
      facts,
      exampleMd: input.exampleMd,
      yaml: last?.yaml,
      profile: last?.profile,
      rationale: last?.rationale,
      test: last?.test,
      issues: last?.issues ?? [],
      mdWarnings: last?.profile ? readMarkdown(last.profile, input.exampleMd).warnings : [],
    });
    return {
      ok: stop === 'passed',
      stopReason: stop,
      yaml: last?.yaml,
      profile: last?.profile,
      attempts,
      usage: total,
      review,
    };
  };

  if (!opts.allowSend) {
    stop = 'not-allowed';
    return finish();
  }

  const system = buildSystemPrompt();
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: buildUserPrompt({
        typeName: input.typeName,
        hint: input.hint,
        facts,
        exampleMd: input.exampleMd,
        dataSchema: input.dataSchema,
        textOnly: llm.capability !== 'B',
      }),
    },
  ];
  const responseSchema = llm.capability === 'C' ? undefined : { name: 'profile_draft', schema: buildResponseSchema() };
  const tools = llm.capability === 'A' ? TOOLS : undefined;

  for (let n = 1; n <= maxIter; n++) {
    if (total.inputTokens + total.outputTokens >= maxTokens) {
      stop = 'token-limit';
      break;
    }
    let usage: Usage = { inputTokens: 0, outputTokens: 0 };
    let toolCalls = 0;
    let res: LlmResponse | undefined;
    for (let round = 0; round <= maxTools; round++) {
      const req: LlmRequest = { system, messages, tools, responseSchema };
      res = await llm.complete(req);
      usage = sum(usage, res.usage);
      if (!res.toolCalls.length || !tools) break;
      toolCalls += res.toolCalls.length;
      messages.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls });
      for (const c of res.toolCalls)
        messages.push({ role: 'tool', toolCallId: c.id, name: c.name, content: await runTool(c, input, facts) });
      if (round === maxTools) res = undefined; // 도구만 부르다 끝남
    }
    total = sum(total, usage);

    const draft = res ? extractDraft(res) : { error: '도구 호출 횟수 상한까지 최종 답이 없음' };
    if (!draft.yaml) {
      attempts.push({ n, draftError: draft.error, issues: [], toolCalls, usage });
      messages.push({ role: 'assistant', content: res?.text ?? '' });
      messages.push({
        role: 'user',
        content: `최종 답을 얻지 못했습니다: ${draft.error}. { "profile": {...}, "rationale": [...] } 형식으로 다시 내세요.`,
      });
      if (n === maxIter) stop = 'no-draft';
      continue;
    }

    const parsed = parseProfile(draft.yaml);
    const issues: Issue[] = [...parsed.issues];
    let test: ProfileTestResult | undefined;
    if (parsed.profile) {
      const chk = await checkProfile(input.engine, parsed.profile, input.template, {
        lineOf: parsed.lineOf,
        dataSchema: input.dataSchema,
      });
      issues.push(...chk.issues);
      if (chk.ok)
        test = await testProfile(input.engine, {
          profile: parsed.profile,
          template: input.template,
          exampleMd: input.exampleMd,
          dataSchema: input.dataSchema,
          renderDiagram: input.renderDiagram,
        });
    }
    const failedChecks = test?.report?.verify.checks.filter((c) => !c.ok).map((c) => c.name) ?? [];
    const errors = issues.filter((i) => i.severity === 'error');
    const passed = !!parsed.profile && errors.length === 0 && !!test?.ok;
    attempts.push({
      n,
      yaml: draft.yaml,
      issues,
      dryRun: test
        ? { ok: test.ok, failedChecks, violations: test.violations?.length ?? 0, issues: test.issues?.length ?? 0 }
        : undefined,
      toolCalls,
      usage,
    });
    last = { yaml: draft.yaml, profile: parsed.profile, rationale: draft.rationale ?? last?.rationale, test, issues };
    if (passed) {
      stop = 'passed';
      break;
    }
    if (n === maxIter) break;

    messages.push({ role: 'assistant', content: draft.yaml });
    messages.push({
      role: 'user',
      content: `점검/드라이런 결과입니다. 오류를 모두 고친 전체 프로필을 다시 내세요(고칠 필요 없는 부분은 그대로).\n${JSON.stringify(
        {
          attempt: n,
          issues: brief(issues),
          dryRun: test && {
            ok: test.ok,
            violations: test.violations?.slice(0, 20),
            issues: test.issues ? brief(test.issues) : undefined,
            failedChecks,
          },
        },
        null,
        1,
      )}`,
    });
  }
  return finish();
}
