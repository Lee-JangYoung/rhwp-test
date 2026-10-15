import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

// 사용: yangsik-mcp [--root <허용 폴더>]...   (환경변수 YANGSIK_ROOTS=경로1:경로2 도 가능, 없으면 현재 폴더)
// 잘못된 인자는 오류로 종료한다(조용히 현재 폴더 전체를 허용하지 않는다).
function parseRoots(args: string[]): string[] {
  const roots: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--root') {
      const v = args[++i];
      if (!v || v.startsWith('--')) throw new Error('--root에는 폴더 경로가 필요함');
      roots.push(v);
    } else if (a.startsWith('--root=')) {
      const v = a.slice('--root='.length);
      if (!v) throw new Error('--root=에는 폴더 경로가 필요함');
      roots.push(v);
    } else throw new Error(`알 수 없는 인자: ${a} (사용: yangsik-mcp [--root <폴더>]...)`);
  }
  if (roots.length === 0 && process.env.YANGSIK_ROOTS)
    roots.push(...process.env.YANGSIK_ROOTS.split(':').filter(Boolean));
  if (roots.length === 0) roots.push(process.cwd());
  return roots;
}

try {
  const roots = parseRoots(process.argv.slice(2));
  await createServer({ roots }).connect(new StdioServerTransport());
  console.error(`yangsik-mcp 시작 (허용 폴더: ${roots.join(', ')})`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
