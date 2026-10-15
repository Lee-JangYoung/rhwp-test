# 검증 상태 (단일 출처)

설계의 `[검증 필요]` 항목을 코드로 확정한다. 판정: 성공 / 부분 / 실패 / **미검증**. 결과는 근거와 함께 이 표를 갱신하고 영향 문서에서 표시를 제거한다.
시험 조건(2026-10-14~15, `@rhwp/core@0.8.7`): Node 22·24와 Chromium(Playwright). 양식은 **우리가 만든 합성 양식**과 rhwp 저장소의 외부 샘플(표본 40개, 저장소에 넣지 않음). 코드는 보관 브랜치 `archive/poc-final`(이식 전 PoC)과 `packages/`(이식본). **한컴 열림은 미확인(S-23).**

| ID | 질문 | 판정 | 영향 |
|---|---|---|---|
| S-00 | Node `initSync` + 근사 폭 측정으로 `createEmpty()` → `insertText` → `exportHwp` → 재로드 | **성공** | adr-0003 |
| S-01 | 양식 로드 시 `getStyleList`/`getFieldList`가 쓸 만한 정보를 주는가 | **부분** — 번들 템플릿 문서에서 스타일 목록(바탕글, 본문 …)과 필드 목록 반환. 실제 양식 미검증 | doctype-profile |
| S-02 | HWPX 저장이 양식 요소(머리말·쪽번호·스타일)를 보존하는가 | **부분** — 단순 문서에서 HWP·HWPX 저장→재로드, 재저장(HWP→HWP, HWPX→HWPX), 교차 저장이 모두 쪽수·문단·컨트롤·필드·텍스트 동일, 손실 보고 0건. 외부 샘플 40개는 HWPX 왕복 39/40이며 쪽번호 컨트롤이 7→4로 줄었는데도 손실 보고가 0건이었다(S-19). 머리말·복합 스타일 미검증. **HWPX에 비표준 파일 `META-INF/rhwp-hwp5-origin`이 포함됨 — 한컴이 무시하고 여는지 미확인** | known-limitations L-04, adr-0010 |
| S-03 | `applyStyle`로 양식 스타일을 정확히 적용하는가 | 미검증 | adr-0002 |
| S-04 | `insertPictureEx` 지원 확장자·크기 단위, Mermaid PNG 삽입 | **부분** — PNG 삽입 성공(Mermaid 렌더 PNG 포함), HWP·HWPX 재로드 후 그림 유지, `renderPageSvg`에 `<image>` 포함. 폭은 HWPUNIT. **기본값이 떠 있는 개체(용지 기준)라 표를 덮는다 → `setPictureProperties({treatAsChar:true})` 필요(S-20).** 브라우저에서도 Mermaid→PNG→삽입 성공(S-18). JPG/GIF/SVG, 큰 이미지 쪽 넘김, 한컴 표시 미검증 | ir-spec, mermaid |
| S-05 | 표 생성·셀 텍스트·머리행 서식, 쪽 넘김 | **부분** — `createTable`, `insertTextInCell`, 행 추가·삭제, 표 복제 성공. 머리행 서식 미검증. **조판은 `pageBreak` 값을 무시하고 "글자처럼 취급" 표를 쪽 경계에서 나누지 않음(S-20)** | md-element-mapping |
| S-06 | 목록(번호/글머리표) 적용 방법, 3단계 중첩 | 미검증 | md-element-mapping |
| S-07 | 문서 끝에 순차 추가(1,000문단) | 미검증 | engine-interface |
| S-08 | 인라인 서식 구간 적용 | 미검증 | md-element-mapping |
| S-09 | 각주 삽입 | 미검증 | md-element-mapping |
| S-10 | 본문 시작 위치 지정(책갈피/치환) | 미검증 | doctype-profile |
| S-11 | 폭 계산 경로(`measureTextWidth` 등)와 쪽수 정확도 | 미검증 — Node 시험에서 `measureTextWidth`가 호출되지 않아 실제 폭 계산 경로 확인 필요. `@rhwp/editor` README는 "조판(줄바꿈·페이지 분할)은 내장 폰트 메트릭 기준"이라고 설명(코드로 미확인) | adr-0003, L-02 |
| S-12 | 대용량 성능, `beginDeferredPagination` 효과 | 미검증 | architecture |
| S-13 | Worker + OffscreenCanvas 폭 측정 | 미검증 | web-ui |
| S-14 | `exportHwp(x)` 반환 형태와 `contentLoss` 사용법 | **성공** — `exportHwp()`·`exportHwpx()`는 `Uint8Array` 반환, `*WithReport`는 `hasBytes()`/`contentLoss()`(JSON), `exportHwpVerify()`는 `{bytesLen, pageCountBefore/After, recovered}` | engine-interface, L-09 |
| S-15 | `createBlankDocument()`(번들 템플릿) 사용법과 한컴 호환 | **부분** — 인스턴스 메서드(`createEmpty()` 후 호출)로 스타일 목록과 구역·단 정의를 가진 문서가 됨. 한컴 열림 미확인 | known-limitations L-11 |
| S-16 | Mermaid PNG 렌더의 결정성(같은 입력 → 같은 이미지)과 환경 고정 | 미검증 (렌더 자체는 성공: mermaid-cli + Chromium `--no-sandbox`, 다이어그램당 약 3초, 한글 레이블 정상). 브라우저에서는 `mermaid`(htmlLabels 끔)→SVG→canvas→PNG로 약 0.6초, 사용자 글꼴 반영 확인(S-21) | mermaid |
| S-17 | 글꼴이 쪽수·줄 배치(`lineseg`)에 미치는 영향: (a) 같은 글꼴/대체 글꼴에서 쪽수 비교, (b) 한컴이 저장된 `lineseg`를 재사용하는지 재계산하는지, (c) 리포트의 `fontsUsed`/`fontSubstitutions` 활용 | 미검증 — `getDocumentInfo()`의 `fontsUsed`/`fontSubstitutions` 조회, HWPX에 글꼴 이름만 기록되고 `lineseg`가 저장됨은 확인. 스튜디오가 우리 산출물을 열 때 `lineseg 배열이 비어있음: 4`(#2527) 경고를 냄(한컴 영향 미확인) | L-12, S-11, adr-0003 |
| R-01 | 실제 양식에서 표 구조·병합·머리행·필드·스타일·개요 추출 정확도 | **부분** — `getControls`, `getTableDimensions`, `getCellInfo`(병합 포함) 동작. 외부 샘플 40개 중 해석 가능한 표는 모두 처리(다중 구역 2개는 구역 0만 지원). 합성 양식 외 실제 SI 양식 미검증 | doctype-profile |
| R-02 | 양식의 반복 블록을 복제·채울 수 있는가 | **성공(rhwp 내)** — 표 복제(`copyControl`+`insertParagraph`+`pasteControl`) 후 셀 주소 지정 채움(`mergeParagraphInCell`→`deleteTextInCell`→`splitParagraphInCell`+`insertTextInCell`)으로 복제본별 다른 값을 넣음. 외부 샘플 중 해석 가능한 29개 모두 성공. `importParagraphBlock`은 셀 내부 구조가 있는 블록에서 18/26만 성공해 쓰지 않음. 한컴 확인 전(S-23) | doctype-profile, adr-0012 |
| S-18 | 브라우저(Chromium)에서 코어·Mermaid·`@rhwp/editor`가 동작하는가 | **성공(합성 양식)** — W1~W8: rhwp WASM 로드, 호스팅 스튜디오 iframe 표시, 양식 라벨↔md 값 매핑 패널, 규약 위반 줄 번호 표시, 변환(채움 약 0.3초)·자체 검증, Mermaid 약 0.6초, 양식·md 업로드, 자동 미리보기(0.8초), `editor.exportHwpx()`. Safari/iPad, Artifact 프레임, 실제 양식은 미검증 | adr-0011, web-ui |
| S-19 | 외부 샘플 40개 안정성 | **부분** — 로드 40/40, HWPX 왕복 39/40, 누름틀 12/13, 표 복제·셀 채움 해석 가능 29/29. 쪽번호 컨트롤 7→4 손실을 `contentLoss`가 보고하지 않음. 표본은 rhwp 재현용 파일이 많아 업무 양식과 분포가 다를 수 있고 75%가 비한컴 글꼴 | known-limitations L-16 |
| S-20 | 조판 보정(그림 배치, 표 높이, 쪽 나눔) | **성공(rhwp 내)** — (1) 그림 `treatAsChar:true` 필요, (2) 셀 내용을 바꿔도 표 저장 높이가 낡아 뒤따르는 개체가 표를 가림 → 셀 높이를 `getTableCellBboxes` 렌더 높이로 설정(`fitTableHeights`), (3) `pageBreak`=CELL(2) 설정은 되지만 조판은 값을 무시하고 "글자처럼 취급" 표를 나누지 않음 → 쪽을 넘는 반복 블록은 떠 있는 표 + CELL. 한컴 동작 미확인. 한컴 표본 표 403개 중 `pageBreak` CELL 377, 떠 있는 표 58%/글자처럼 취급 42% | adr-0012, L-13~L-15 |
| S-21 | 글꼴 동적 추가, 에디터 내보내기 | **부분** — 사용자 `.ttf`를 `FontFace`로 등록하고 SVG `@font-face`(data URI)로 Mermaid 그림에 반영(25자 부분 글꼴로 시험, 5 MB 전체 글꼴은 미확인). 에디터(iframe)에는 적용 불가. `editor.exportHwpx()` 결과는 ZIP이고 재로드 시 표 3개 확인, 사람이 고친 내용이 담기는지는 미확인. `suppressDialogs:false`로 로컬 글꼴 감지 흐름이 로드를 멈추지 않음만 확인 | web-ui, L-18 |
| S-22 | Artifact(제한 프레임)에서 웹 PoC가 동작하는가 | 미검증 — 게시 완료, 화면 확인 대기. 예상: 외부 iframe 임베드·다운로드 제한 | web-ui |
| S-23 | **한컴에서 열림·표시**(P6): 합성 양식 산출물 5개(표 높이 맞춤 유무, 떠 있는 표/글자처럼 취급 비교 포함), 비표준 항목 `META-INF/rhwp-hwp5-origin`, 비어 있는 `lineseg` 처리 | **미검증** — 한컴 환경에서 사람이 확인해야 함. "한컴과 거의 동일"의 판정 근거 | 전체 |
| S-24 | 런타임·패키지 매니저 호환(Node 24 LTS, pnpm 12) | **부분** — Node 24.22.0에서 타입체크·vitest 10개·웹 빌드·Playwright 3개 통과. pnpm 10.28·12.11.2에서 설치 성공하나 pnpm 12는 빌드 스크립트 허용 설정(`esbuild`, `puppeteer`) 없이는 오류로 중단, 암묵 의존성 `mdast` 타입 누락이 드러남(`@types/mdast` 명시 필요). Node 26은 미시험 | adr-0013 |
| S-25 | 프로필 형식 v1(바인딩 트리)이 유스케이스 양식을 표현하고, 점검이 LLM 전형 오류를 잡는가 | **부분** — 합성 유스케이스 양식에서 스키마·점검 통과, 전형 오류 12종과 YAML 문법 오류를 코드·경로·후보·줄 번호로 보고(자동 시험). 클래스·DB 명세서·목록 문서 형태는 **스키마 표현까지만**(점검은 미검증 kind라 거부). I-3: 프로필만으로 유스케이스 변환이 이전(하드코딩) 결과와 **ZIP 항목 SHA-256까지 동일**(골든 시험, 가짜 렌더러), 프로필을 바꾸면 라벨·누름틀·번호 형식·정책이 바뀜(자동 시험), 점검 실패는 변환 거부. **LLM이 실제로 이 형식으로 쓸 수 있는지(R-03)와 가이드·도구의 환각 감소 효과는 미검증** | doctype-profile, adr-0016 |
| R-03 | LLM 해석 초안(프로필)이 사람이 보정 가능한 품질인가 | 미검증 (양식 샘플 필요, 후순위) | adr-0006, adr-0007 |

## 진행 방식
시험 코드는 `packages/*/test`, `packages/web/e2e`에 있고(PoC 원본은 보관 브랜치 `archive/poc-final`), 결과는 이 표만 갱신한다. S-01~S-03, S-10, R-01은 실제 양식(HWPX)이 필요하고 S-23은 한컴 환경이 필요하다. 실패 항목은 대안을 ADR로 남긴다.

## 테스트 방침 (구현 단계)
- 단위: 파서·IR·스키마 검증·렌더 계획(rhwp 불필요, Vitest)
- 엔진: 실제 WASM으로 편집 → 저장 → 재로드 왕복
- 통합: `examples/` md를 변환해 골든과 비교 — 바이트가 아니라 쪽수, 쪽별 텍스트, 문단 스타일, 표 구조, 필드 값, 손실 여부
- 브라우저: Playwright(시스템 Chromium), 시험은 `vitest`와 분리(`web/e2e`는 vitest 대상에서 제외)
- 한컴 열림 확인은 릴리스 전 수동 체크(이 환경에서는 불가, S-23)
