// 프로필 JSON Schema를 등록부(KINDS)에서 생성해 packages/core/schema/profile.schema.json에 쓴다.
// 사용법: pnpm gen:schema   (시험이 저장된 파일과 생성 결과의 일치를 검사한다)
import { writeFileSync } from 'node:fs';
import { buildProfileSchema } from '@yangsik/core';

const out = new URL('../packages/core/schema/profile.schema.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(buildProfileSchema(), null, 2)}\n`);
console.log(`쓴 파일: ${out.pathname}`);
