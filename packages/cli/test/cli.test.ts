import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const BIN = at('../bin/yangsik.mjs');
const UC = at('../../../templates/usecase');
const PROFILE = join(UC, 'profile.yaml');
const tmp = () => mkdtempSync(join(tmpdir(), 'yangsik-cli-'));

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync('node', [BIN, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('CLI', () => {
  it('인자가 없으면 도움말과 종료 코드 1, help는 0', () => {
    expect(run([]).code).toBe(1);
    const h = run(['help']);
    expect(h.code).toBe(0);
    expect(h.stdout).toContain('yangsik profile generate');
    expect(run(['없는명령']).code).toBe(1);
  });

  it('doctor', () => {
    const r = run(['doctor', '--json']);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ rhwp: '0.8.7' });
  });

  it('validate: 정상 0, 위반 1(줄 번호), --json은 stdout에 JSON만', () => {
    expect(run(['validate', join(UC, 'example.md'), '-p', PROFILE]).code).toBe(0);
    const bad = run(['validate', join(UC, 'fixtures/bad1.md'), '-p', PROFILE]);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('bad1.md:8');
    const j = run(['validate', join(UC, 'fixtures/bad1.md'), '-p', PROFILE, '--json']);
    const parsed = JSON.parse(j.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.files[0].violations[0]).toMatchObject({ line: 8 });
  });

  it('convert: 변환 0, 폴더 출력, 보고서 파일, 위반은 1', () => {
    const dir = tmp();
    const r = run([
      'convert',
      join(UC, 'example.md'),
      '-p',
      PROFILE,
      '-o',
      join(dir, 'out.hwpx'),
      '--no-mermaid',
      '--report',
      join(dir, 'r.json'),
    ]);
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, 'out.hwpx'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')).files[0].report.verify.ok).toBe(true);

    // 여러 md: 폴더로 나가고, 하나라도 위반이면 전체 코드는 1이지만 나머지는 변환된다
    const multi = run([
      'convert',
      join(UC, 'example.md'),
      join(UC, 'fixtures/bad1.md'),
      '-p',
      PROFILE,
      '-o',
      dir,
      '--no-mermaid',
    ]);
    expect(multi.code).toBe(1);
    expect(existsSync(join(dir, 'example.hwpx'))).toBe(true);
    expect(existsSync(join(dir, 'bad1.hwpx'))).toBe(false);
  });

  it('convert --json: stdout에는 JSON 하나', () => {
    const dir = tmp();
    const r = run([
      'convert',
      join(UC, 'example.md'),
      '-p',
      PROFILE,
      '-o',
      join(dir, 'a.hwpx'),
      '--no-mermaid',
      '--json',
    ]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });

  it('profile check: 정상 0, 양식에 없는 라벨은 1(코드·후보), 알 수 없는 kind는 1', () => {
    expect(run(['profile', 'check', PROFILE]).code).toBe(0);
    const dir = tmp();
    const text = readFileSync(PROFILE, 'utf8');
    for (const f of ['template.hwpx', 'schema.json']) writeFileSync(join(dir, f), readFileSync(join(UC, f)));
    writeFileSync(join(dir, 'p1.yaml'), text.replace('유스케이스명:', '유스케이스 이름:'));
    const r = run(['profile', 'check', join(dir, 'p1.yaml'), '--json']);
    expect(r.code).toBe(1);
    const issue = JSON.parse(r.stdout).issues[0];
    expect(issue).toMatchObject({ code: 'label-not-found' });
    expect(issue.candidates).toContain('유스케이스명');
    writeFileSync(join(dir, 'p2.yaml'), text.replace('kind: cells', 'kind: cellz'));
    expect(run(['profile', 'check', join(dir, 'p2.yaml')]).code).toBe(1);
  });

  it('profile test: 드라이런과 매핑 대조표', () => {
    const r = run(['profile', 'test', PROFILE, '--no-mermaid']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('UC-001');
    expect(r.stdout).toContain('통과');
  });

  it('profile analyze / kinds / guide / schema', () => {
    expect(JSON.parse(run(['profile', 'analyze', join(UC, 'template.hwpx')]).stdout).tables.length).toBeGreaterThan(0);
    expect(run(['profile', 'kinds']).stdout).toContain('repeat');
    expect(run(['profile', 'guide', 'errors']).stdout).toContain('label-not-found');
    expect(run(['profile', 'guide', '없는주제']).code).toBe(1);
    expect(JSON.parse(run(['profile', 'schema']).stdout).type).toBe('object');
  });

  it('profile generate: 전송 허용 없이는 호출하지 않고(1), --print-prompt는 전송 내용만 보여 준다', () => {
    const base = [
      'profile',
      'generate',
      '--template',
      join(UC, 'template.hwpx'),
      '--example-md',
      join(UC, 'example.md'),
    ];
    const noAllow = run([...base, '--provider', 'anthropic', '--model', 'x']);
    expect(noAllow.code).toBe(1);
    expect(noAllow.stderr).toContain('--allow-send');
    const p = run([...base, '--print-prompt', '--json']);
    expect(p.code).toBe(0);
    const preview = JSON.parse(p.stdout);
    expect(preview.excludes).toContain('HWPX 파일 바이너리');
    expect(preview.user).toContain('UC ID');
    // 제공자 패키지가 없으면 설치 방법을 안내하고 1
    const missing = run([...base, '--provider', 'ollama', '--model', 'x', '--allow-send']);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('@langchain/ollama');
  });

  it('CLI의 필수 의존에 LLM 라이브러리가 없다', () => {
    const pkg = JSON.parse(readFileSync(at('../package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).filter((d) => /langchain|anthropic|openai|author/.test(d))).toEqual([]);
  });
});
