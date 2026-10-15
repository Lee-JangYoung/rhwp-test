// 프로필 파일 레퍼런스(_spec/04-conversion/profile-reference.md)를 가이드 생성기에서 만든다.
// 사용법: pnpm --filter @yangsik/core gen:docs   (시험이 저장된 파일과 생성 결과의 일치를 검사한다)
import { writeFileSync } from 'node:fs';
import { profileReferenceMarkdown } from './profile-docs';

const out = new URL('../../../_spec/04-conversion/profile-reference.md', import.meta.url);
writeFileSync(out, profileReferenceMarkdown());
console.log(`쓴 파일: ${out.pathname}`);
