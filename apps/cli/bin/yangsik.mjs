#!/usr/bin/env node
// 빌드 없이 TS 소스를 실행한다 (I-4 D3). 배포 형태는 기능 평가 후 결정.
import { register } from 'tsx/esm/api';

register();
await import('../src/cli.ts');
