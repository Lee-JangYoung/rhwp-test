import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { rhwpEngine } from '@yangsik/engine-rhwp/node';
import {
  extractDraft,
  generateProfile,
  type GenerateInput,
  langChainClient,
  type LlmClient,
  previewPrompt,
  reviewToMarkdown,
  ScriptedLlm,
} from '../src/index';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const USECASE = at('../../../templates/usecase');
const GOOD = readFileSync(join(USECASE, 'profile.yaml'), 'utf8');
const BAD = GOOD.replace('유스케이스명:', '유스케이스 이름:'); // 양식에 없는 라벨
const TEMPLATE = new Uint8Array(readFileSync(join(USECASE, 'template.hwpx')));
const EXAMPLE = readFileSync(join(USECASE, 'example.md'), 'utf8');
const SCHEMA = JSON.parse(readFileSync(join(USECASE, 'schema.json'), 'utf8')) as object;

const input: GenerateInput = {
  engine: rhwpEngine,
  template: TEMPLATE,
  exampleMd: EXAMPLE,
  dataSchema: SCHEMA,
  typeName: '유스케이스 명세서',
};
const draft = (yaml: string, rationale: unknown[] = []) => ({ structured: { profile: YAML.parse(yaml), rationale } });

describe('generateProfile: 점검 루프', () => {
  it('능력 A: 도구로 사실을 조회하고, 틀린 초안을 점검 오류를 보고 고쳐 통과한다', async () => {
    const llm = new ScriptedLlm([
      { toolCalls: [{ id: 't1', name: 'analyze_template', args: {} }] },
      draft(BAD),
      draft(GOOD, [
        {
          path: 'bindings[1]',
          why: '유스케이스마다 표가 하나씩',
          confidence: 'high',
          evidence: ['UC ID', '지어낸 문구'],
        },
      ]),
    ]);
    const r = await generateProfile(input, { llm, allowSend: true });
    expect(r.ok).toBe(true);
    expect(r.stopReason).toBe('passed');
    expect(r.attempts.map((a) => a.issues.filter((i) => i.severity === 'error').length > 0)).toEqual([true, false]);
    expect(r.attempts[0].toolCalls).toBe(1);

    // 둘째 요청: 도구 결과(양식 사실)가 대화에 들어 있다
    const tool = llm.requests[1].messages.find((m) => m.role === 'tool');
    expect(tool && 'content' in tool && JSON.parse(tool.content).tables.length).toBeGreaterThan(0);
    // 셋째 요청: 점검 오류(코드·후보)가 되돌아갔다
    const fb = llm.requests[2].messages.at(-1);
    expect(fb?.role).toBe('user');
    expect(fb && 'content' in fb && fb.content).toContain('label-not-found');
    expect(fb && 'content' in fb && fb.content).toContain('유스케이스명');

    expect(r.review.status).toBe('passed');
    expect(r.review.dryRun?.ok).toBe(true);
    expect(r.review.coverage.tables[0].unmapped).toEqual([]);
    // 근거 인용 확인: 양식에 있는 'UC ID'는 통과, 없는 문구는 표시
    expect(r.review.rationale[0].unverifiedEvidence).toEqual(['지어낸 문구']);
    expect(r.usage.inputTokens).toBe(3000);
    expect(reviewToMarkdown(r.review, r.yaml)).toContain('통과');
  });

  it('능력 B: 도구 없이 구조화 출력만 쓰고, 요청에 tools가 없다', async () => {
    const llm = new ScriptedLlm([draft(GOOD)], 'B');
    const r = await generateProfile(input, { llm, allowSend: true });
    expect(r.ok).toBe(true);
    expect(llm.requests[0].tools).toBeUndefined();
    expect(llm.requests[0].responseSchema?.name).toBe('profile_draft');
  });

  it('능력 C: 일반 텍스트(코드 블록 JSON)로 받아도 같은 점검을 통과해야 한다', async () => {
    const text = `설명입니다.\n\`\`\`json\n${JSON.stringify({ profile: YAML.parse(GOOD) })}\n\`\`\``;
    const llm = new ScriptedLlm([{ text }], 'C');
    const r = await generateProfile(input, { llm, allowSend: true });
    expect(r.ok).toBe(true);
    expect(llm.requests[0].tools).toBeUndefined();
    expect(llm.requests[0].responseSchema).toBeUndefined();
    expect(llm.requests[0].messages[0].role === 'user' && llm.requests[0].messages[0].content).toContain(
      'JSON 객체 하나만',
    );
  });

  it('잘못된 초안은 통과로 인정되지 않는다: 상한까지 반복하고 마지막 초안과 남은 오류를 보고한다', async () => {
    const llm = new ScriptedLlm([draft(BAD)]);
    const r = await generateProfile(input, { llm, allowSend: true, maxIterations: 3 });
    expect(r.ok).toBe(false);
    expect(r.stopReason).toBe('max-iterations');
    expect(r.attempts).toHaveLength(3);
    expect(r.yaml).toBe(YAML.stringify(YAML.parse(BAD)));
    expect(r.review.remainingIssues.some((i) => i.code === 'label-not-found')).toBe(true);
    expect(r.review.status).toBe('failed');
  });

  it('YAML 문법 오류·알 수 없는 kind도 구조화된 오류로 되돌아간다', async () => {
    const unknownKind = GOOD.replace('kind: cells', 'kind: cellz');
    const llm = new ScriptedLlm([{ text: `\`\`\`yaml\n${unknownKind}\`\`\`` }, draft(GOOD)]);
    const r = await generateProfile(input, { llm, allowSend: true });
    expect(r.ok).toBe(true);
    const fb = llm.requests[1].messages.at(-1);
    expect(fb && 'content' in fb && fb.content).toContain('unknown-kind');
  });

  it('토큰 상한을 넘으면 멈추고 현재 초안을 보고한다', async () => {
    const llm = new ScriptedLlm([{ ...draft(BAD), usage: { inputTokens: 300_000, outputTokens: 200_000 } }]);
    const r = await generateProfile(input, { llm, allowSend: true, maxTotalTokens: 400_000 });
    expect(r.stopReason).toBe('token-limit');
    expect(r.attempts).toHaveLength(1);
    expect(r.yaml).toBeDefined();
  });

  it('최종 답이 없으면(no-draft) 형식을 다시 요청한다', async () => {
    const llm = new ScriptedLlm([{ text: '모르겠습니다' }]);
    const r = await generateProfile(input, { llm, allowSend: true, maxIterations: 2 });
    expect(r.stopReason).toBe('no-draft');
    expect(r.attempts.every((a) => a.draftError)).toBe(true);
  });

  it('전송을 허용하지 않으면 LLM을 호출하지 않는다 (D15)', async () => {
    const llm = new ScriptedLlm([draft(GOOD)]);
    const r = await generateProfile(input, { llm, allowSend: false });
    expect(r.stopReason).toBe('not-allowed');
    expect(llm.requests).toHaveLength(0);
  });
});

describe('전송 내용 미리보기와 비전송 원칙', () => {
  it('보내는 것은 가이드·양식 사실·예제 md뿐이고 HWPX 바이너리는 없다', async () => {
    const p = await previewPrompt(input, 'A');
    const all = JSON.stringify(p);
    expect(p.user).toContain('UC ID'); // 양식 사실
    expect(p.user).toContain(EXAMPLE.split('\n')[1]); // 예제 md
    expect(p.system).toContain('프로필 작성 가이드');
    expect(all).not.toContain('PK\u0003\u0004');
    expect(all).not.toContain('mimetype');
    expect(all).not.toMatch(/ANTHROPIC|OPENAI|API_KEY/);
    expect(p.excludes).toContain('HWPX 파일 바이너리');
    expect(p.tools.map((t) => t.name)).toContain('check_profile');
    expect((await previewPrompt(input, 'C')).tools).toEqual([]);
  });
});

describe('extractDraft', () => {
  it('구조화 객체·JSON 코드 블록·YAML 코드 블록·profile 없는 객체를 구분한다', () => {
    expect(extractDraft({ text: '', structured: { profile: { version: 1 } } }).yaml).toContain('version: 1');
    expect(extractDraft({ text: '{"bindings": [], "version": 1}' }).yaml).toContain('bindings');
    expect(extractDraft({ text: '```yaml\nversion: 1\n```' }).yaml).toBe('version: 1');
    expect(extractDraft({ text: '{"foo": 1}' }).error).toContain('profile');
    expect(extractDraft({ text: '{깨진' }).error).toBeDefined();
  });
});

describe('LangChain 어댑터 (가짜 채팅 모델, 네트워크 없음)', () => {
  it('능력 C: 채팅 모델의 텍스트 응답으로 프로필을 생성한다', async () => {
    const { FakeListChatModel } = await import('@langchain/core/utils/testing');
    const model = new FakeListChatModel({ responses: [JSON.stringify({ profile: YAML.parse(GOOD) })] });
    const llm: LlmClient = langChainClient(model, { id: 'fake/list', capability: 'C' });
    const r = await generateProfile(input, { llm, allowSend: true });
    expect(r.ok).toBe(true);
    expect(r.review.generation.model).toBe('fake/list');
  });
});

describe('경계: 코어는 LLM에 의존하지 않는다', () => {
  it('@yangsik/core의 package.json과 소스에 LLM 라이브러리 참조가 없다', () => {
    const core = at('../../core');
    const pkg = readFileSync(join(core, 'package.json'), 'utf8');
    expect(pkg).not.toMatch(/langchain|anthropic|openai|ollama/i);
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
      );
    const hits = walk(join(core, 'src'))
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /langchain|@anthropic-ai|openai/i.test(readFileSync(f, 'utf8')))
      .map((f) => relative(core, f));
    expect(hits).toEqual([]);
  });
});
