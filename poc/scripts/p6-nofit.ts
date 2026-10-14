// P6 비교용: 표 높이 맞춤을 끈 산출물을 만든다.
// 한컴이 낡은 표 높이(양식의 원래 높이)를 스스로 보정하는지, 그림이 표를 가리는지 확인하는 용도.
import { fileURLToPath } from 'node:url';
import { convert } from '../src/convert';
import { rhwpEngine } from '../src/engine/rhwp';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const r = await convert(rhwpEngine, {
  mdPath: at('../fixtures/md/usecase-ok.md'),
  templatePath: process.argv[2] ?? at('../fixtures/templates/usecase-synthetic.hwpx'),
  outPath: process.argv[3] ?? at('../out/p6/5-표높이맞춤없음-비교용.hwpx'),
  schemaPath: at('../schemas/usecase.schema.json'),
  fitHeights: false,
  workDir: at('../out/work'),
});
console.log('출력:', r.out, `(${r.pages}쪽)`, r.verify.ok ? '검증 통과' : '자체 검증 실패 (의도됨: 낡은 표 높이)');
