// templates/<유형>/profile.yaml 중 등록부 상수와 같아야 하는 것을 쓴다 (시험이 일치를 지킨다)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLASS_SPEC, DB_SPEC, MINIMAL_USECASE } from '@yangsik/core/kinds';

const root = (p: string) => fileURLToPath(new URL(`../templates/${p}`, import.meta.url));
writeFileSync(root('usecase/profile.yaml'), MINIMAL_USECASE);
writeFileSync(root('class-spec/profile.yaml'), CLASS_SPEC);
writeFileSync(root('db-spec/profile.yaml'), DB_SPEC);
console.log('profile.yaml 3개를 썼습니다');
