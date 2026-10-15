// 한컴 확인 키트(S-23): 한컴 환경에서 사람이 열어 볼 산출물, 점검표, 결과 기록 양식을 out/hancom-kit/에 만든다.
//   pnpm kit:hancom
// 이 환경에는 한컴이 없어 결과는 사람이 RESULT.md에 기록하고 verification-spike.md(S-23)에 옮긴다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertBytes } from '@yangsik/hwp';
import { loadProfileFile } from '@yangsik/core/node';
import { findChromium, renderMermaid } from '@yangsik/diagram/node';
import { rhwpEngine } from '@yangsik/engine-rhwp/node';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const OUT = process.argv[2] ?? root('out/hancom-kit');
const work = join(OUT, '.work');
mkdirSync(join(OUT, 'files'), { recursive: true });
mkdirSync(join(OUT, 'source-templates'), { recursive: true });
mkdirSync(work, { recursive: true });

const hasChromium = findChromium() !== null;
type Job = {
  file: string;
  title: string;
  profile: string;
  md: string;
  template?: Uint8Array;
  fitHeights?: boolean;
  checks: string[];
};

const inline = join(work, 'usecase-inline.hwpx');
execFileSync('npx', ['tsx', 'make-templates.ts', inline], {
  cwd: root('tools'),
  env: { ...process.env, TABLE_INLINE: '1' },
  stdio: 'ignore',
});

const COMMON = [
  '열릴 때 오류·복구 대화상자가 없는가',
  '쪽수가 rhwp 미리보기와 같은가',
  '글꼴·줄 간격이 양식 원본과 같은가',
];
const jobs: Job[] = [
  {
    file: '01-유스케이스-기본',
    title: '유스케이스 기본(표 3개 복제, Mermaid 그림)',
    profile: 'usecase',
    md: 'example.md',
    checks: [
      ...COMMON,
      '표 3개가 값이 섞이지 않고 채워졌는가',
      '그림이 표 아래에 겹치지 않고 있는가',
      '누름틀(문서명·버전·작성자·작성일)에 값이 보이는가',
    ],
  },
  {
    file: '02-유스케이스-긴표',
    title: '유스케이스 긴 표(쪽 경계, 떠 있는 표)',
    profile: 'usecase',
    md: 'fixtures/long.md',
    checks: [...COMMON, '표가 쪽 경계에서 이어지는가(셀 단위 나눔)', '이어진 표의 머리·값 셀이 잘리지 않는가'],
  },
  {
    file: '03-유스케이스-표높이맞춤없음-비교용',
    title: '표 높이 맞춤을 끈 비교용(의도적으로 낡은 표 높이)',
    profile: 'usecase',
    md: 'example.md',
    fitHeights: false,
    checks: ['한컴이 낡은 표 높이를 스스로 보정해 01번과 같게 보이는가', '그림이 표를 가리는가'],
  },
  {
    file: '04-유스케이스-글자처럼취급표',
    title: '표를 "글자처럼 취급"으로 만든 양식(긴 표)',
    profile: 'usecase',
    md: 'fixtures/long.md',
    template: new Uint8Array(readFileSync(inline)),
    checks: [...COMMON, '긴 표가 쪽을 넘을 때 나뉘는가(rhwp는 나누지 않고 넘침, L-15)'],
  },
  {
    file: '05-클래스명세서',
    title: '클래스 명세서(표 묶음 복제, 행 목록, 중첩 반복, 표 삭제)',
    profile: 'class-spec',
    md: 'example.md',
    checks: [
      ...COMMON,
      'Member에 메서드 2개(표 4개), Session은 속성 표까지만 있는가',
      '속성·파라미터 행이 견본 행과 같은 서식(테두리·글꼴)인가',
      '복제된 표 사이 간격이 어색하지 않은가(L-20)',
    ],
  },
  {
    file: '06-DB명세서',
    title: 'DB 명세서(행·표 삭제)',
    profile: 'db-spec',
    md: 'example.md',
    checks: [
      ...COMMON,
      'MEMBER는 비고 행과 인덱스 표가 있고 LOGIN_LOG는 둘 다 없는가',
      '컬럼 행이 견본 행과 같은 서식인가',
    ],
  },
  {
    file: '07-보고서-토큰문단',
    title: '보고서(토큰 치환, 표식 문단을 목록으로 전개)',
    profile: 'report',
    md: 'example.md',
    checks: [
      ...COMMON,
      '작성자·작성일 토큰이 값으로 바뀌었는가',
      '요약이 번호 매긴 문단 3개로 늘어났고 본문 서식과 같은가',
    ],
  },
];

const manifest: Record<string, unknown>[] = [];
for (const j of jobs) {
  const dir = root(`templates/${j.profile}`);
  const loaded = loadProfileFile(join(dir, 'profile.yaml'));
  const profile = loaded.profile;
  if (!profile) throw new Error(`${j.profile}: 프로필 오류 ${JSON.stringify(loaded.issues)}`);
  const template = j.template ?? new Uint8Array(readFileSync(join(dir, 'template.hwpx')));
  const dataSchema = loaded.schemaPath ? (JSON.parse(readFileSync(loaded.schemaPath, 'utf8')) as object) : undefined;
  const md = readFileSync(join(dir, j.md), 'utf8');
  const { bytes, hwp, report, previews } = await convertBytes(rhwpEngine, {
    profile,
    mdText: md,
    template,
    dataSchema,
    mdName: j.md,
    renderDiagram: hasChromium ? async (src, name) => renderMermaid(src, work, name) : undefined,
    skipDiagrams: !hasChromium,
    output: j.fitHeights === false ? { fitHeights: false } : undefined,
    preview: true,
    formats: ['hwpx', 'hwp'],
  });
  writeFileSync(join(OUT, 'files', `${j.file}.hwpx`), bytes);
  const hwpOk = !!(hwp && report.hwp?.ok);
  if (hwp && hwpOk) writeFileSync(join(OUT, 'files', `${j.file}.hwp`), hwp);
  const pdir = join(OUT, 'rhwp-preview', j.file);
  mkdirSync(pdir, { recursive: true });
  for (const [i, svg] of previews.entries()) writeFileSync(join(pdir, `page-${i + 1}.svg`), svg);
  manifest.push({
    file: `files/${j.file}.hwpx`,
    hwpNotes: report.hwp?.notes ?? [],
    hwp: hwpOk
      ? {
          file: `files/${j.file}.hwp`,
          sha256: createHash('sha256')
            .update(hwp as Uint8Array)
            .digest('hex'),
        }
      : null,
    title: j.title,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    pages: report.pages,
    selfVerify: report.verify.ok,
    failedChecks: report.verify.checks.filter((c) => !c.ok).map((c) => c.name),
    nonStandardEntry: report.verify.nonStandardEntry,
  });
}
for (const t of ['usecase', 'class-spec', 'db-spec', 'report'])
  writeFileSync(join(OUT, 'source-templates', `${t}.hwpx`), readFileSync(root(`templates/${t}/template.hwpx`)));

writeFileSync(
  join(OUT, 'MANIFEST.json'),
  JSON.stringify(
    {
      rhwp: rhwpEngine.version,
      mermaidRendered: hasChromium,
      generatedBy: 'pnpm kit:hancom',
      files: manifest,
    },
    null,
    2,
  ),
);

const checklist = `# 한컴 확인 점검표 (S-23)

한컴오피스(한글)에서 \`files/\` 의 각 파일을 열고 아래를 확인해 \`RESULT.md\`에 적어 주세요.
기준 화면은 \`rhwp-preview/<파일>/page-N.svg\`(rhwp가 그린 모습), 양식 원본은 \`source-templates/\`입니다.

**준비 기록**: 한컴 제품·버전: ______  OS: ______  확인한 사람/날짜: ______

## 모든 파일 공통
- 열릴 때 "파일이 손상되었습니다/복구" 같은 대화상자가 없는가
- 비표준 항목(\`META-INF/rhwp-hwp5-origin\`)과 비어 있는 \`lineseg\` 때문에 경고가 뜨는가
- 쪽수가 rhwp 미리보기(\`MANIFEST.json\`의 pages)와 같은가
- 열어서 저장(다른 이름으로 .hwpx)한 뒤 다시 열어도 내용이 같은가
- 같은 이름의 \`.hwp\`(HWP 5.0)도 열리고, \`.hwpx\`와 쪽수·표·값·그림이 같은가 (rhwp가 HWPX에서 변환해 저장한 파일이라 한컴 열림은 미확인)

## 파일별
${jobs.map((j) => `### ${j.file}.hwpx — ${j.title}\n${j.checks.map((c) => `- [ ] ${c}`).join('\n')}`).join('\n\n')}

## 판정 기준(제안, 승인 필요)
- **합격**: 열림 오류 없음, 쪽수 같음, 값·표·그림 위치가 rhwp 미리보기와 눈으로 같음(글꼴 대체로 인한 줄바꿈 차이는 허용)
- **보류**: 열리지만 표 높이·쪽 경계·간격이 다름 → 원인(L-14/15/20) 분류 후 보정 방안을 ADR로
- **불합격**: 열림 오류, 값 누락·섞임
`;
writeFileSync(join(OUT, 'CHECKLIST.md'), checklist);

writeFileSync(
  join(OUT, 'RESULT.md'),
  `# 한컴 확인 결과 (S-23)

확인한 사람/날짜: ______  한컴 제품·버전/OS: ______

| 파일 | 열림 | 쪽수(한컴/rhwp) | 모양 일치 | 판정(합격/보류/불합격) | 비고(스크린샷 파일명 등) |
|---|---|---|---|---|---|
${jobs.flatMap((j) => [`| ${j.file}.hwpx |  |  /  |  |  |  |`, `| ${j.file}.hwp |  |  /  |  |  |  |`]).join('\n')}

이 표를 채운 뒤 \`_spec/06-quality/verification-spike.md\`의 S-23 행과 \`known-limitations.md\`(L-14/15/17/20/22)를 갱신합니다.
`,
);
console.log(`한컴 확인 키트: ${OUT}  (파일 ${jobs.length}개, Mermaid ${hasChromium ? '렌더' : '생략'})`);
