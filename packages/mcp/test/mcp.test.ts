import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const TEMPLATES = at('../../../templates');
const UC = join(TEMPLATES, 'usecase');
const work = mkdtemp();
function mkdtemp() {
  return mkdtempSync(join(tmpdir(), 'yangsik-mcp-'));
}

async function connect(roots = [TEMPLATES, work]) {
  const server = createServer({ roots });
  const client = new Client({ name: 'test', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
/** 도구를 호출해 JSON 결과(또는 오류 문장)를 돌려준다 */
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text: string }[];
    isError?: boolean;
  };
  const t = r.content[0].text;
  return { isError: !!r.isError, text: t, json: r.isError ? undefined : (JSON.parse(t) as Record<string, any>) };
}

describe('MCP 서버: 프로필 작성 도구', () => {
  it('도구 목록: 작성 도구와 변환 도구가 모두 있다', async () => {
    const c = await connect();
    const names = (await c.listTools()).tools.map((t) => t.name);
    for (const n of [
      'analyze_template',
      'list_kinds',
      'get_guide',
      'get_profile_schema',
      'check_profile',
      'test_profile',
      'preview_mapping',
      'list_doctypes',
      'get_md_template',
      'validate_md',
      'convert_md',
      'preview_output',
    ])
      expect(names).toContain(n);
  });

  it('analyze_template·list_kinds·get_guide는 코어와 같은 사실을 준다', async () => {
    const c = await connect();
    const facts = (await call(c, 'analyze_template', { template_path: join(UC, 'template.hwpx') })).json;
    expect(facts?.tables[0].labels).toContain('UC ID');
    expect((await call(c, 'list_kinds')).json?.kinds.map((k: { name: string }) => k.name)).toContain('rows');
    expect((await call(c, 'get_guide', { topic: 'errors' })).json?.markdown).toContain('label-not-found');
    expect((await call(c, 'get_profile_schema')).json?.type).toBe('object');
  });

  it('check_profile: 정상은 ok, 틀린 YAML 초안은 코드·후보와 함께 오류', async () => {
    const c = await connect();
    expect((await call(c, 'check_profile', { profile_path: join(UC, 'profile.yaml') })).json?.ok).toBe(true);
    const bad = readFileSync(join(UC, 'profile.yaml'), 'utf8').replace('유스케이스명:', '유스케이스 이름:');
    const r = (await call(c, 'check_profile', { profile_yaml: bad, template_path: join(UC, 'template.hwpx') })).json;
    expect(r?.ok).toBe(false);
    expect(r?.issues[0]).toMatchObject({ code: 'label-not-found' });
    expect(r?.issues[0].candidates).toContain('유스케이스명');
  });

  it('test_profile·preview_mapping: 드라이런과 대조표', async () => {
    const c = await connect();
    const t = (await call(c, 'test_profile', { profile_path: join(UC, 'profile.yaml') })).json;
    expect(t?.ok).toBe(true);
    expect(t?.mapping.items).toHaveLength(3);
    const m = (
      await call(c, 'preview_mapping', {
        profile_path: join(UC, 'profile.yaml'),
        md_text: readFileSync(join(UC, 'example.md'), 'utf8'),
      })
    ).json;
    expect(m?.items[0].id).toBe('UC-001');
  });
});

describe('MCP 서버: 변환 도구', () => {
  it('list_doctypes·get_md_template', async () => {
    const c = await connect();
    const doctypes = ((await call(c, 'list_doctypes')).json?.doctypes ?? []) as { type: string }[];
    const types = doctypes.map((d) => d.type);
    expect(types).toEqual(expect.arrayContaining(['usecase', 'class-spec', 'db-spec', 'report']));
    const tpl = (await call(c, 'get_md_template', { profile_path: join(UC, 'profile.yaml') })).json;
    expect(tpl?.rules).toContain("'{id} {name}'");
    expect(tpl?.example).toContain('## UC-001');
    expect(tpl?.schema).toBeDefined();
  });

  it('validate_md: 위반은 줄 번호와 함께, 고친 md는 통과 (작성→검증→수정 루프)', async () => {
    const c = await connect();
    const bad = (
      await call(c, 'validate_md', { profile_path: join(UC, 'profile.yaml'), md_path: join(UC, 'fixtures/bad1.md') })
    ).json;
    expect(bad?.ok).toBe(false);
    expect(bad?.violations[0]).toMatchObject({ line: 8 });
    const good = (
      await call(c, 'validate_md', {
        profile_path: join(UC, 'profile.yaml'),
        md_text: readFileSync(join(UC, 'example.md'), 'utf8'),
      })
    ).json;
    expect(good?.ok).toBe(true);
  });

  it('convert_md: md 본문으로 변환해 허용 폴더에 저장하고, 위반은 ok:false로 돌려준다', async () => {
    const c = await connect();
    const out = join(work, 'out/uc.hwpx');
    const r = (
      await call(c, 'convert_md', {
        profile_path: join(UC, 'profile.yaml'),
        md_text: readFileSync(join(UC, 'example.md'), 'utf8'),
        out_path: out,
        skip_diagrams: true,
      })
    ).json;
    expect(r).toMatchObject({ ok: true, items: 3 });
    expect(existsSync(out)).toBe(true);
    const bad = (
      await call(c, 'convert_md', {
        profile_path: join(UC, 'profile.yaml'),
        md_path: join(UC, 'fixtures/bad1.md'),
        out_path: join(work, 'out/bad.hwpx'),
      })
    ).json;
    expect(bad?.ok).toBe(false);
    expect(bad?.violations.length).toBeGreaterThan(0);
    expect(existsSync(join(work, 'out/bad.hwpx'))).toBe(false);
    const prev = (await call(c, 'preview_output', { file_path: out })).json;
    expect(prev?.svg).toContain('<svg');
  });

  it('클래스 명세서도 같은 도구로 변환된다', async () => {
    const c = await connect();
    const dir = join(TEMPLATES, 'class-spec');
    const r = (
      await call(c, 'convert_md', {
        profile_path: join(dir, 'profile.yaml'),
        md_path: join(dir, 'example.md'),
        out_path: join(work, 'out/class.hwpx'),
        skip_diagrams: true,
      })
    ).json;
    expect(r?.ok).toBe(true);
  });
});

describe('MCP 서버: 파일 접근 제한', () => {
  it('허용 폴더 밖 읽기·쓰기, 경로 탈출, 없는 파일은 오류(isError)', async () => {
    const c = await connect();
    const outside = join(tmpdir(), 'yangsik-outside.md');
    writeFileSync(outside, '# x');
    expect((await call(c, 'validate_md', { profile_path: join(UC, 'profile.yaml'), md_path: outside })).isError).toBe(
      true,
    );
    expect(
      (
        await call(c, 'validate_md', {
          profile_path: join(UC, 'profile.yaml'),
          md_path: join(UC, '../../package.json'),
        })
      ).text,
    ).toContain('허용 폴더 밖');
    expect(
      (
        await call(c, 'convert_md', {
          profile_path: join(UC, 'profile.yaml'),
          md_text: '',
          out_path: join(tmpdir(), '..', 'escape.hwpx'),
        })
      ).isError,
    ).toBe(true);
    expect((await call(c, 'analyze_template', { template_path: join(UC, '없음.hwpx') })).text).toContain('파일이 없음');
  });

  it('상대 경로는 첫 허용 폴더 기준이다', async () => {
    const c = await connect([UC, work]);
    expect((await call(c, 'analyze_template', { template_path: 'template.hwpx' })).json?.tables).toBeDefined();
  });
});

describe('MCP 서버: stdio 실행(실제 프로세스)', () => {
  it('yangsik-mcp를 띄워 클라이언트로 도구를 호출한다. LLM 의존은 없다', async () => {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [at('../bin/yangsik-mcp.mjs'), '--root', TEMPLATES],
    });
    const client = new Client({ name: 'stdio-test', version: '0' });
    await client.connect(transport);
    try {
      const r = await call(client, 'get_guide', { topic: 'overview' });
      expect(r.json?.markdown).toContain('프로필 작성 가이드');
    } finally {
      await client.close();
    }
    const pkg = JSON.parse(readFileSync(at('../package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).filter((d) => /langchain|anthropic|openai/.test(d))).toEqual([]);
  });
});
