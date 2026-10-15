#!/usr/bin/env node
// 빌드 없이 TS 소스를 실행한다 (CLI와 같은 방식). 사용: yangsik-mcp [--root <허용 폴더>]...
import { register } from 'tsx/esm/api';

register();
await import('../src/main.ts');
