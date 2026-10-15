import {
  analyzeTemplate,
  checkProfile,
  describeKinds,
  type DocumentEngine,
  getProfileGuide,
  GUIDE_TOPICS,
  type GuideTopic,
  type Issue,
  type Profile,
  parseProfile,
  readMarkdown,
  type TemplateFacts,
} from '@yangsik/core';
import { type DiagramRenderer, previewMapping, type ProfileTestResult, testProfile } from '@yangsik/hwp';
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

export type StopReason = 'passed' | 'max-iterations' | 'token-limit' | 'no-draft' | 'not-allowed' | 'llm-error';

export interface GenerateResult {
  ok: boolean;
  stopReason: StopReason;
  /** 마지막 초안(통과하지 못했어도 남긴다) */
  yaml?: string;
  profile?: Profile;
  attempts: Attempt[];
  usage: Usage;
  review: ReviewReport;
  /** stopReason이 llm-error일 때 모델 호출의 오류 메시지 */
  error?: string;
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

/** 사용량이 없거나 이상하면(0·NaN) 글자 수로 어림해 비용 상한이 꺼지지 않게 한다 */
function usageOf(res: LlmResponse, req: LlmRequest): Usage {
  const ok = (n: number) => Number.isFinite(n) && n >= 0;
  const { inputTokens: i, outputTokens: o } = res.usage ?? { inputTokens: Number.NaN, outputTokens: Number.NaN };
  if (ok(i) && ok(o) && i + o > 0) return { inputTokens: i, outputTokens: o };
  const inChars = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
  const outChars = res.text.length + JSON.stringify(res.structured ?? '').length;
  return { inputTokens: Math.ceil(inChars / 3), outputTokens: Math.ceil(outChars / 3) };
}

/** 프로필 폴더에 복사될 파일 이름과 맞는지: LLM이 임의 경로(/etc/passwd 등)를 쓰지 못하게 한다 */
function fileNameIssues(profile: Profile, hasSchema: boolean): Issue[] {
  const out: Issue[] = [];
  if (profile.template !== 'template.hwpx')
    out.push({
      code: 'invalid-value',
      severity: 'error',
      path: 'template',
      message: "template은 'template.hwpx'여야 함(프로필 폴더에 그 이름으로 복사됨)",
      actual: profile.template,
      candidates: ['template.hwpx'],
    });
  if (hasSchema && profile.schema !== 'schema.json')
    out.push({
      code: 'invalid-value',
      severity: 'error',
      path: 'schema',
      message: "schema는 'schema.json'이어야 함",
      actual: profile.schema,
      candidates: ['schema.json'],
    });
  if (!hasSchema && profile.schema !== undefined)
    out.push({
      code: 'invalid-value',
      severity: 'error',
      path: 'schema',
      message: '규약(schema)이 주어지지 않았으므로 schema 키를 쓰지 않는다',
      actual: profile.schema,
    });
  return out;
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
      '양식 사실: 표별 0열 라벨·첫 4행 텍스트·앞 12칸 샘플, 누름틀 이름, 토큰, 본문 문단 앞 60개(각 80자까지)',
      '예제 md 전문',
      ...(input.dataSchema ? ['md 규약(JSON Schema)'] : []),
    ],
    excludes: [
      'HWPX 파일 바이너리',
      '위에 적은 범위 밖의 양식 내용(표 셀 전체, 본문 60문단 이후, 80자 뒤)',
      'API 키·환경변수',
    ],
  };
}

/** 모델이 낸 근거를 검증한다: 모양이 맞지 않는 항목은 버린다(보고서가 깨지지 않게) */
function cleanRationale(v: unknown): Rationale[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Rationale[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    if (typeof r.path !== 'string' || typeof r.why !== 'string') continue;
    out.push({
      path: r.path,
      why: r.why,
      confidence:
        r.confidence === 'high' || r.confidence === 'medium' || r.confidence === 'low' ? r.confidence : undefined,
      evidence: Array.isArray(r.evidence) ? r.evidence.filter((e): e is string => typeof e === 'string') : undefined,
    });
  }
  return out;
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
    const rationale = cleanRationale(obj.rationale);
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
      case 'get_guide': {
        const topic = call.args.topic;
        if (topic !== undefined && !(GUIDE_TOPICS as readonly unknown[]).includes(topic))
          return JSON.stringify({ error: `주제는 ${GUIDE_TOPICS.join(' | ')} 중 하나` });
        return getProfileGuide(topic as GuideTopic | undefined).markdown;
      }
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
  let lastError: string | undefined;

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
      error: lastError,
    };
  };

  if (opts.allowSend !== true) {
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

  const budgetLeft = (used: Usage) =>
    total.inputTokens + total.outputTokens + used.inputTokens + used.outputTokens < maxTokens;
  const MAX_PARALLEL_TOOLS = 8;

  for (let n = 1; n <= maxIter; n++) {
    if (!budgetLeft({ inputTokens: 0, outputTokens: 0 })) {
      stop = 'token-limit';
      break;
    }
    let usage: Usage = { inputTokens: 0, outputTokens: 0 };
    let toolCalls = 0;
    let res: LlmResponse | undefined;
    let llmError: string | undefined;
    let outOfBudget = false;
    // 도구를 쓰는 라운드는 최대 maxTools번(마지막 최종 답 호출 포함 LLM 호출은 최대 maxTools+1번)
    for (let round = 0; round <= maxTools; round++) {
      if (!budgetLeft(usage)) {
        outOfBudget = true;
        res = undefined;
        break;
      }
      const req: LlmRequest = { system, messages, tools, responseSchema };
      try {
        res = await llm.complete(req);
      } catch (e) {
        llmError = e instanceof Error ? e.message : String(e);
        res = undefined;
        break;
      }
      usage = sum(usage, usageOf(res, req));
      if (!res.toolCalls.length || !tools) break;
      const calls = res.toolCalls.slice(0, MAX_PARALLEL_TOOLS);
      toolCalls += calls.length;
      messages.push({ role: 'assistant', content: res.text, toolCalls: calls });
      for (const c of calls)
        messages.push({ role: 'tool', toolCallId: c.id, name: c.name, content: await runTool(c, input, facts) });
      if (round === maxTools) res = undefined; // 도구만 부르다 끝남
    }
    total = sum(total, usage);
    if (llmError !== undefined) {
      attempts.push({ n, draftError: `모델 호출 실패: ${llmError}`, issues: [], toolCalls, usage });
      stop = 'llm-error';
      lastError = llmError;
      break;
    }
    if (outOfBudget) {
      attempts.push({ n, draftError: '토큰 상한에 도달', issues: [], toolCalls, usage });
      stop = 'token-limit';
      break;
    }

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

    // 모델이 낸 YAML은 신뢰할 수 없는 입력이다: 해석·점검 중 예외도 한 번의 실패 시도로 다룬다
    let parsed: ReturnType<typeof parseProfile>;
    const issues: Issue[] = [];
    let test: ProfileTestResult | undefined;
    try {
      parsed = parseProfile(draft.yaml);
      issues.push(...parsed.issues);
      if (parsed.profile) {
        issues.push(...fileNameIssues(parsed.profile, !!input.dataSchema));
        const chk = await checkProfile(input.engine, parsed.profile, input.template, {
          lineOf: parsed.lineOf,
          dataSchema: input.dataSchema,
        });
        issues.push(...chk.issues);
        if (chk.ok && !issues.some((i) => i.severity === 'error'))
          test = await testProfile(input.engine, {
            profile: parsed.profile,
            template: input.template,
            exampleMd: input.exampleMd,
            dataSchema: input.dataSchema,
            renderDiagram: input.renderDiagram,
          });
      }
    } catch (e) {
      parsed = { issues: [] };
      issues.push({
        code: 'yaml-syntax',
        severity: 'error',
        path: '',
        message: `프로필을 해석할 수 없음: ${(e as Error).message.split('\n')[0]}`,
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
