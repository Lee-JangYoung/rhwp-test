/**
 * 실제 LLM 스파이크 (키가 있는 개발자 PC에서 실행, CI 제외).
 *   pnpm author:spike -- <provider> <model> [A|B|C]
 *   provider: anthropic | openai | ollama  (해당 @langchain/* 패키지를 먼저 설치: pnpm add -D --filter @yangsik/author @langchain/anthropic)
 * 키는 환경변수(ANTHROPIC_API_KEY, OPENAI_API_KEY)로만 준다. 전송 내용은 합성 유스케이스 양식과 예제 md뿐이다.
 * 결과는 out/spike/<provider>-<model>/ 에 저장되고, 표를 verification-spike.md에 옮겨 적는다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rhwpEngine } from '@yangsik/core/node';
import { type Capability, generateProfile, langChainClient, reviewToMarkdown } from '@yangsik/author';

const [provider, model, cap = 'A'] = process.argv.slice(2).filter((a) => a !== '--');
if (!provider || !model) {
  console.error('사용: spike <anthropic|openai|ollama> <model> [A|B|C]');
  process.exit(2);
}
const PKG: Record<string, [string, string]> = {
  anthropic: ['@langchain/anthropic', 'ChatAnthropic'],
  openai: ['@langchain/openai', 'ChatOpenAI'],
  ollama: ['@langchain/ollama', 'ChatOllama'],
};
const [pkg, cls] = PKG[provider] ?? [];
if (!pkg) throw new Error(`알 수 없는 provider: ${provider}`);
// 샘플링 파라미터는 지정하지 않는다(Claude Opus 5.5는 temperature 등을 거부한다)
const mod = (await import(pkg).catch(() => {
  throw new Error(`${pkg}가 설치되어 있지 않음: pnpm add -D --filter @yangsik/author ${pkg}`);
})) as Record<string, new (o: object) => never>;
const chat = new mod[cls]({ model }) as never;

const root = join(import.meta.dirname, '../templates/usecase');
const rows: [string, string][] = [];
const probe = async (name: string, f: () => Promise<string>) => {
  try {
    rows.push([name, await f()]);
  } catch (e) {
    rows.push([name, `실패: ${(e as Error).message.slice(0, 200)}`]);
  }
};
const client = (c: Capability) => langChainClient(chat, { id: `${provider}/${model}`, capability: c });

await probe('① 도구 호출', async () => {
  const r = await client('A').complete({
    system: '도구를 호출해 답하세요.',
    messages: [{ role: 'user', content: '양식 사실을 조회하세요.' }],
    tools: [
      { name: 'analyze_template', description: '양식 사실 조회', parameters: { type: 'object', properties: {} } },
    ],
  });
  return r.toolCalls.length ? `성공 (${r.toolCalls[0].name})` : `도구 호출 없음: ${r.text.slice(0, 80)}`;
});
await probe('② 구조화 출력', async () => {
  const r = await client('B').complete({
    system: '스키마에 맞는 JSON으로 답하세요.',
    messages: [{ role: 'user', content: '인사말을 한 문장으로.' }],
    responseSchema: {
      name: 'greet',
      schema: {
        type: 'object',
        required: ['text'],
        additionalProperties: false,
        properties: { text: { type: 'string' } },
      },
    },
  });
  return r.structured ? `성공 ${JSON.stringify(r.structured).slice(0, 60)}` : `structured 없음: ${r.text.slice(0, 80)}`;
});
await probe('④ 사용량 조회', async () => {
  const r = await client('C').complete({ system: '짧게', messages: [{ role: 'user', content: '안녕' }] });
  return r.usage.inputTokens > 0 ? `입력 ${r.usage.inputTokens} / 출력 ${r.usage.outputTokens}` : '사용량 없음(0)';
});

const out = join(import.meta.dirname, '../../../out/spike', `${provider}-${model}`.replace(/[^\w.-]/g, '_'));
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const res = await generateProfile(
  {
    engine: rhwpEngine,
    template: new Uint8Array(readFileSync(join(root, 'template.hwpx'))),
    exampleMd: readFileSync(join(root, 'example.md'), 'utf8'),
    dataSchema: JSON.parse(readFileSync(join(root, 'schema.json'), 'utf8')) as object,
    typeName: '유스케이스 명세서',
  },
  { llm: client(cap as Capability), allowSend: true },
);
rows.push([
  `생성(능력 ${cap})`,
  `${res.stopReason}, 시도 ${res.attempts.length}회, 토큰 ${res.usage.inputTokens}/${res.usage.outputTokens}, ${Math.round((Date.now() - t0) / 1000)}초`,
]);
writeFileSync(join(out, 'review.md'), reviewToMarkdown(res.review, res.yaml));
writeFileSync(join(out, 'review.json'), JSON.stringify(res.review, null, 1));
if (res.yaml) writeFileSync(join(out, 'profile.yaml'), res.yaml);
console.log(`\n| 항목 | 결과 |\n|---|---|\n${rows.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}\n\n산출물: ${out}`);
