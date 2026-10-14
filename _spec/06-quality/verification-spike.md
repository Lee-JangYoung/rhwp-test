# 검증 상태 (단일 출처)

설계의 `[검증 필요]` 항목을 코드로 확정한다. 판정: 성공 / 부분 / 실패 / **미검증**. 결과는 근거와 함께 이 표를 갱신하고 영향 문서에서 표시를 제거한다.
시험 조건(2026-10-14, `@rhwp/core@0.8.7`, Node): **단순 문서(텍스트·표·그림·누름틀), 번들 템플릿 기반, 근사 폭 측정, 한컴 미확인.** 실제 양식은 아직 없다.

| ID | 질문 | 판정 | 영향 |
|---|---|---|---|
| S-00 | Node `initSync` + 근사 폭 측정으로 `createEmpty()` → `insertText` → `exportHwp` → 재로드 | **성공** | adr-0003 |
| S-01 | 양식 로드 시 `getStyleList`/`getFieldList`가 쓸 만한 정보를 주는가 | **부분** — 번들 템플릿 문서에서 스타일 목록(바탕글, 본문 …)과 필드 목록 반환. 실제 양식 미검증 | doctype-profile |
| S-02 | HWPX 저장이 양식 요소(머리말·쪽번호·스타일)를 보존하는가 | **부분** — 단순 문서에서 HWP·HWPX 저장→재로드, 재저장(HWP→HWP, HWPX→HWPX), 교차 저장이 모두 쪽수·문단·컨트롤·필드·텍스트 동일, 손실 보고 0건. 머리말·쪽번호·복합 스타일 미검증. **HWPX에 비표준 파일 `META-INF/rhwp-hwp5-origin`이 포함됨 — 한컴이 무시하고 여는지 미확인** | known-limitations L-04, adr-0010 |
| S-03 | `applyStyle`로 양식 스타일을 정확히 적용하는가 | 미검증 | adr-0002 |
| S-04 | `insertPictureEx` 지원 확장자·크기 단위, Mermaid PNG 삽입 | **부분** — PNG 삽입 성공(Mermaid 렌더 PNG 포함), HWP·HWPX 재로드 후 그림 유지, `renderPageSvg`에 `<image>` 포함. 폭은 HWPUNIT. JPG/GIF/SVG, 큰 이미지 쪽 넘김, 한컴 표시 미검증 | ir-spec, mermaid |
| S-05 | 표 생성·셀 텍스트·머리행 서식, 쪽 넘김 | **부분** — `createTable`, `insertTextInCell`, 행 추가·삭제, 표 복제 성공. 머리행 서식·쪽 넘김 미검증 | md-element-mapping |
| S-06 | 목록(번호/글머리표) 적용 방법, 3단계 중첩 | 미검증 | md-element-mapping |
| S-07 | 문서 끝에 순차 추가(1,000문단) | 미검증 | engine-interface |
| S-08 | 인라인 서식 구간 적용 | 미검증 | md-element-mapping |
| S-09 | 각주 삽입 | 미검증 | md-element-mapping |
| S-10 | 본문 시작 위치 지정(책갈피/치환) | 미검증 | doctype-profile |
| S-11 | 글꼴 메트릭 기반 폭 측정 시 쪽수 정확도 | 미검증 | adr-0003, L-02 |
| S-12 | 대용량 성능, `beginDeferredPagination` 효과 | 미검증 | architecture |
| S-13 | Worker + OffscreenCanvas 폭 측정 | 미검증 | web-ui |
| S-14 | `exportHwp(x)` 반환 형태와 `contentLoss` 사용법 | **성공** — `exportHwp()`·`exportHwpx()`는 `Uint8Array` 반환, `*WithReport`는 `hasBytes()`/`contentLoss()`(JSON), `exportHwpVerify()`는 `{bytesLen, pageCountBefore/After, recovered}` | engine-interface, L-09 |
| S-15 | `createBlankDocument()`(번들 템플릿) 사용법과 한컴 호환 | **부분** — 인스턴스 메서드(`createEmpty()` 후 호출)로 스타일 목록과 구역·단 정의를 가진 문서가 됨. 한컴 열림 미확인 | known-limitations L-11 |
| S-16 | Mermaid PNG 렌더의 결정성(같은 입력 → 같은 이미지)과 환경 고정 | 미검증 (렌더 자체는 성공: mermaid-cli + Chromium `--no-sandbox`, 다이어그램당 약 3초, 한글 레이블 정상) | mermaid |
| R-01 | 실제 양식에서 표 구조·병합·머리행·필드·스타일·개요 추출 정확도 | **부분** — `getControls`, `getTableDimensions`, `getCellInfo`(병합 포함) 동작. 실제 양식 미검증 | doctype-profile |
| R-02 | 양식의 반복 블록을 복제·채울 수 있는가 | **부분** — 표 행 추가·삭제, 표 복제(`copyControl`+`pasteControl`), 문단·표 블록 반복(`importParagraphBlock`의 `count`, 0번 문단 제외, `dryRun` 무변경), `replaceAll`(표 셀 포함 전체 치환). **복제본별 값 채움이 미해결**: `replaceOne`은 본문 순차만 되고 표 셀은 안 됨 → 셀 주소 지정 API 또는 고유 필드명 검증 필요 | doctype-profile |
| R-03 | LLM 해석 초안(프로필)이 사람이 보정 가능한 품질인가 | 미검증 (양식 샘플 필요, 후순위) | adr-0006, adr-0007 |

## 진행 방식
`spike/`에 항목별 스크립트(`s01-*.mjs` …)를 두고 결과로 이 표를 갱신한다. S-01~S-03, S-10, R-01·R-02는 실제 양식(HWPX)이 필요하다. 실패 항목은 대안을 ADR로 남긴다.

## 테스트 방침 (구현 단계)
- 단위: 파서·IR·스키마 검증·렌더 계획(rhwp 불필요, Vitest)
- 엔진: 실제 WASM으로 편집 → 저장 → 재로드 왕복
- 통합: `examples/` md를 변환해 골든과 비교 — 바이트가 아니라 쪽수, 쪽별 텍스트, 문단 스타일, 표 구조, 필드 값, 손실 여부
- 한컴 열림 확인은 릴리스 전 수동 체크(이 환경에서는 불가)
