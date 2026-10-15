import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

// 사용: yangsik-mcp [--root <허용 폴더>]...   (환경변수 YANGSIK_ROOTS=경로1:경로2 도 가능, 기본은 현재 폴더)
const args = process.argv.slice(2);
const roots: string[] = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--root' && args[i + 1]) roots.push(args[++i]);
if (roots.length === 0 && process.env.YANGSIK_ROOTS)
  roots.push(...process.env.YANGSIK_ROOTS.split(':').filter(Boolean));
if (roots.length === 0) roots.push(process.cwd());

await createServer({ roots }).connect(new StdioServerTransport());
console.error(`yangsik-mcp 시작 (허용 폴더: ${roots.join(', ')})`);
