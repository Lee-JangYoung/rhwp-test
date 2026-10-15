# PoC: Markdown → HWPX (rhwp)

가능성 확인용 최소 프로젝트다. 제품 코드가 아니며, 결과는 `_spec`에 반영하기 전까지 이 문서가 기록한다.
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

## 결과 (2026-10-14, `@rhwp/core@0.8.7`)

| ID | 시나리오 | 결과 |
|---|---|---|
| P1 | md 파싱·규약 검증 | **통과** — 정상 1건, 위반 3종을 줄 번호·기대 값과 함께 보고 |
| P2 | 누름틀 채움 | **통과** — 저장·재로드 후 값 유지. 실제 양식 샘플에서도 12/13 |
| P3 | 표 단위 복제 + 복제본별 값 채움 | **통과** — 셀 주소 지정 방식(`deleteTextInCell`+`insertTextInCell`, 셀 안 문단 분할)으로 복제본마다 다른 값. 외부 샘플 40개 중 해석 가능한 29개 모두 성공(병합 셀 첫 표 11/11) |
| P4 | Mermaid → 그림 | **통과** — PNG 렌더(약 1.5~3초), 글자처럼 취급 그림으로 삽입, 저장·재로드에서 유지 |
| P5 | 저장·자체 검증 | **통과** — 독립 확인으로 HWPX XML을 직접 열어 표·그림·누름틀 수와 값을 대조 |
| P6 | 한컴 열림 (수동) | **대기** — `out/p6/` 산출물 5개 확인 필요 |

## 이번 PoC에서 새로 알게 된 것 (모두 `verify.ts` 또는 시험으로 고정)

1. **그림 기본값이 떠 있는 개체**다. `insertPictureEx`는 `treatAsChar:false`, 기준 `Paper`로 만들어 용지 왼쪽 위에 붙어 표를 덮는다. `setPictureProperties({treatAsChar:true})`로 바꿔야 한다. (자체 검증은 통과했지만 미리보기를 보고서야 발견 → 검증 항목 추가)
2. **표 저장 높이가 낡는다.** 셀 내용을 바꿔도 표의 저장 높이는 양식의 원래 값(예: 8974 HU)으로 남아, 뒤따르는 그림·문단이 표를 가린다. `reflowLinesegs`로는 갱신되지 않고, **셀 높이를 렌더 높이(`getTableCellBboxes`)로 설정**하면 갱신된다(`fitTableHeights`). 쪽을 넘는 표는 쪽마다 조각난 셀 높이를 합산한다.
3. **표의 쪽 나눔은 `pageBreak`를 `CELL`(2, 셀 단위로 나눔)로 둔다.** HWPX 값은 NONE/TABLE/CELL(0/1/2)이며 한컴 샘플 표 403개 중 377개가 CELL이다.
4. **rhwp 조판은 `pageBreak` 값을 무시하고 "글자처럼 취급"인 표를 나누지 않는다.** 긴 표는 글자처럼 취급이면 1쪽에 넘쳐 그려지고(재로드해도 동일), 떠 있는 표여야 다음 쪽으로 이어진다. 따라서 쪽을 넘는 반복 블록은 **떠 있는 표 + CELL**이 필요하다. 한컴에서의 동작은 P6로 확인한다.
5. **`contentLoss` 보고만 믿을 수 없다.** 이전 표본 분석에서 쪽번호 컨트롤이 7→4개로 줄었는데 손실 보고는 0건이었다. 저장 전후 컨트롤 종류별 개수를 직접 비교한다.
6. 표본의 표 배치 분포: 떠 있는 표 58%, 글자처럼 취급 42%. 다중 구역 문서(2/40)는 문단 번호가 구역 기준이라 구역 0만 지원하는 PoC에서는 건너뛴다.

## 웹 PoC (React + `@rhwp/editor`, `web/`)

```bash
npm run web                 # http://127.0.0.1:5173 (Vite)
npx playwright test         # 시스템 Chromium + 에이전트 프록시로 W1~W6 자동 확인
```

코어(`src/core.ts`, `src/engine/rhwp.ts`)는 Node API 없이 브라우저에서 그대로 돈다. Node 전용은 `convert.ts`·`mermaid.ts`·`engine/rhwp-node.ts`뿐이다.

| ID | 시나리오 | 결과 (2026-10-15) |
|---|---|---|
| W1 | 브라우저에서 rhwp WASM 로드, 호스팅 스튜디오(`edwardkim.github.io/rhwp`) 에디터에 양식·결과 표시 | **통과** |
| W2 | 양식 라벨 ↔ md 값 매핑 미리보기 (React 패널) | **통과** |
| W3 | 규약 위반을 md 줄 번호와 함께 표시 | **통과** (`input.md:8 /items/0/id 형식 불일치`) |
| W4 | 브라우저 변환 (복제·채움·높이 맞춤·자체 검증) | **통과** — 3항목·셀 20개, 자체 검증 통과, 2쪽 |
| W5 | Mermaid → PNG (브라우저 `mermaid`, htmlLabels 끔, canvas) → 글자처럼 취급 그림 삽입 | **통과** — 약 0.6초, 그림 1개 |
| W6 | HWPX 저장(다운로드) | **통과** — 저장 파일을 Node 엔진으로 재로드해 표 3·그림 1(글자처럼 취급) 확인 |

| W7 | 사용자가 올린 글꼴(.ttf/.otf/.woff2)을 실행 중에 추가 | **통과** — `FontFace`로 페이지에 등록(`document.fonts.check` 참), Mermaid 그림에 반영(PNG 해시 변경). 글꼴은 브라우저 메모리에만 있고 서버·저장소로 가지 않음 |

| W8 | 양식(.hwpx)·md 파일 업로드, 자동 미리보기(입력 후 0.8초, Mermaid 제외), 입력 중 규약 위반 표시, 에디터 내용 내보내기 | **통과** — 업로드 후 매핑 갱신, md 수정 시 재미리보기, 위반 `input.md:8` 표시, `editor.exportHwpx()` 결과(ZIP)를 재로드해 표 3개 확인 |

- 에디터 내보내기(`exportHwpx()`)는 "변환 결과 저장"(우리가 만든 바이트)과 다르다. 에디터에서 사람이 고친 내용까지 담기지만, 시험에서는 고친 내용이 실제로 담기는지까지는 확인하지 못했다(미리보기 결과가 그대로 나오는 것만 확인). md로 되돌아가지는 않는다. 한컴 열림은 `[검증 필요]`.
- 자동 미리보기는 결과를 에디터에 다시 불러오므로, 에디터에서 고친 내용은 다음 미리보기 때 덮어쓰인다. 고치기 전에 자동 미리보기를 끈다.
- 글꼴 추가 구현: SVG를 이미지로 그릴 때는 페이지 글꼴이 보이지 않아 글꼴 데이터를 SVG `@font-face`(data URI)에 넣는다. 시퀀스 다이어그램은 글꼴 옵션이 따로 있어 `sequence.*FontFamily`도 지정한다. 시험은 unifont에서 만든 25자 부분 글꼴로 했다(5 MB 전체 글꼴은 그림에 적용됐는지 확인하지 못함). 에디터(iframe)에는 적용되지 않는다 — 에디터 글꼴은 자체 호스팅 스튜디오 빌드(`assets/fonts/`)나 로컬 글꼴 감지 흐름으로만 가능하다.
- "에디터 로컬 글꼴 안내창 표시"(`suppressDialogs:false`)는 켜도 로드가 멈추지 않는 것까지만 확인했다. 맑은 고딕 등 로컬 글꼴이 실제로 쓰이는지는 `[검증 필요]`(이 환경에 해당 글꼴 없음).
- 에디터는 cross-origin iframe이라 셀 단위 강조 표시는 불가 → 매핑은 에디터 옆 React 패널로 보여 준다.
- **외부 의존**: 에디터는 호스팅 스튜디오(`studioUrl` 기본값)를 쓰므로 문서가 외부 호스팅 페이지에서 처리된다(L-08). 자체 호스팅 여부는 미결.
- 스튜디오가 결과 문서 로드 시 `lineseg 배열이 비어있음: 4`(#2527) 경고를 낸다 — 변환 산출물의 일부 문단에 줄 배치 정보가 없다. 한컴 영향 `[검증 필요]`.
- 브라우저 폭 계산(`measureTextWidth`) 경로의 쪽수 정확도는 미확인(S-11).

## 한계

- 합성 양식은 우리가 만든 것이라 한컴이 만든 양식과 다를 수 있다. 외부 샘플은 "복제·셀 채움 기계 동작"만 확인했고 이 변환기의 라벨 매핑(유스케이스 양식)은 적용하지 않았다.
- 한컴 열림, 한컴에서의 표 높이 처리, 비표준 파일(`META-INF/rhwp-hwp5-origin`)의 영향은 미확인(P6).
- 구역 0만 지원, 폭 계산 경로는 미확인(쪽수 정확도 판정 불가), 대용량 성능 미측정.
- 샘플 표본은 rhwp의 버그 재현용 파일이 많아 실제 업무 양식과 분포가 다를 수 있다.
