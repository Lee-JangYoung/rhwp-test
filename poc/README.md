# PoC: Markdown → HWPX (rhwp)

가능성 확인용 최소 프로젝트다. 제품 코드가 아니며, 시험 결과는 `_spec/06-quality/verification-spike.md`가 단일 출처다.
검증하려는 것: **양식 HWPX에 md 내용을 채워 HWPX를 만들 수 있는가** (필드 채움, 표 단위 반복 복제와 복제본별 값 채움, Mermaid 그림, 저장 후 자체 검증).

## 실행

```bash
cd poc
PUPPETEER_SKIP_DOWNLOAD=1 npm install        # Mermaid용 Chromium은 내려받지 않고 시스템 것을 쓴다
npm run make-template                        # 합성 양식 생성 (fixtures/templates/usecase-synthetic.hwpx)
npx tsx src/cli.ts check
npx tsx src/cli.ts validate --md fixtures/md/usecase-bad1.md      # 규약 위반 → 줄 번호와 함께 출력, exit 1
npx tsx src/cli.ts convert --md fixtures/md/usecase-ok.md \
  --template fixtures/templates/usecase-synthetic.hwpx --out out/usecase.hwpx --preview out/preview
npm test                                     # 자동 시험 10개 (Mermaid 시험은 Chromium이 있을 때만)
npm run typecheck
```

- Node 22.13 이상(`mermaid-cli 12`, `vitest 5` 요구). Chromium은 `PUPPETEER_EXECUTABLE_PATH` 또는 `/opt/pw-browsers`에서 찾는다.
- 외부 양식은 `--template <로컬 경로>`로 지정한다. **저작권이 불명확한 샘플은 저장소에 넣지 않는다.**
- 복제·셀 채움 견고성 시험: `npx tsx scripts/stress.ts <selection.json> <samples-root>` (rhwp 샘플을 로컬에 받은 경우).

## 구조

```
src/parse.ts       md → IR (front-matter, H2 항목, 표, 흐름 목록, mermaid 코드펜스)
src/validate.ts    IR을 JSON Schema로 검증, 위반을 md 줄 번호와 함께 보고
src/engine/        엔진 인터페이스(types.ts)와 rhwp 구현(rhwp.ts)  ← @rhwp/core 호출은 여기만
src/blocks.ts      표에서 "라벨 → 값 셀"을 찾는다 (0열 라벨, 1열 값)
src/mermaid.ts     mermaid-cli → PNG
src/convert.ts     파이프라인: 검증 → 양식 열기 → 필드 → 표 복제 → 셀 채움 → 쪽 나눔·높이 → 그림 → 저장 → 자체 검증
src/verify.ts      저장 파일을 다시 열어 값·표 수·그림·컨트롤 개수·쪽 나눔·표 높이·ZIP 구조를 확인
schemas/usecase.schema.json, fixtures/, test/, scripts/
```

## 결과

시험 결과와 판정은 **`_spec/06-quality/verification-spike.md`(단일 출처)**에만 기록한다 (P1~P5 → R-02·S-02·S-04·S-05·S-20, 웹 W1~W8 → S-18·S-21, 외부 샘플 → S-19, 한컴 열림(P6) → S-23).

## 웹 PoC (React + `@rhwp/editor`, `web/`)

```bash
npm run web                 # http://127.0.0.1:5173 (Vite)
npx playwright test         # 시스템 Chromium + 에이전트 프록시로 W1~W8 자동 확인
npm run web:build           # out/web (정적 빌드)
```

코어(`src/core.ts`, `src/engine/rhwp.ts`)는 Node API 없이 브라우저에서 그대로 돈다. Node 전용은 `convert.ts`·`mermaid.ts`·`engine/rhwp-node.ts`뿐이다.
알려진 문제: `npm test`(`vitest run`)가 Playwright 시험(`web/e2e`)까지 읽어 3개가 실패로 나온다. `npx vitest run test`로 실행하면 10개 통과. 제외 설정은 2단계(`_spec/roadmap.md`)에서 한다.

## 한계

- 합성 양식은 우리가 만든 것이라 한컴이 만든 양식과 다를 수 있다. 외부 샘플은 "복제·셀 채움 기계 동작"만 확인했고 이 변환기의 라벨 매핑(유스케이스 양식)은 적용하지 않았다.
- 한컴 열림, 한컴에서의 표 높이 처리, 비표준 파일(`META-INF/rhwp-hwp5-origin`)의 영향은 미확인(P6).
- 구역 0만 지원, 폭 계산 경로는 미확인(쪽수 정확도 판정 불가), 대용량 성능 미측정.
- 샘플 표본은 rhwp의 버그 재현용 파일이 많아 실제 업무 양식과 분포가 다를 수 있다.
