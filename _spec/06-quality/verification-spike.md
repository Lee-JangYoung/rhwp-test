# 위험 검증 스파이크 계획

목적: 설계의 `[검증 필요]` 항목을 코드로 확정해 설계서를 갱신한다. 결과는 각 항목에 **성공 / 부분 / 실패**와 근거(코드·출력)로 기록한다.

## 사전 완료 (2026-10-14)

| ID | 항목 | 결과 |
|---|---|---|
| S-00 | Node에서 `initSync` + 근사 `measureTextWidth`로 빈 문서 생성 → `insertText` → `exportHwp` → 재로드 | 성공 |

## 검증 항목

| ID | 질문 | 방법 | 판정 기준 | 영향 문서 |
|---|---|---|---|---|
| S-01 | 양식 파일을 열면 `getStyleList()`/`getFieldList()`가 쓸 만한 정보를 주는가 | 샘플 양식 로드 후 출력 | 이름·ID 확보 | style-map-spec |
| S-02 | HWPX 저장(`exportHwpx`)이 양식 요소(머리말, 쪽번호, 스타일)를 보존하는가 | 양식 로드 → HWPX/HWP 저장 → 재로드 비교 | 두 포맷 모두 보존 | L-04, ADR |
| S-03 | `applyStyle`로 문단에 양식 스타일을 정확히 적용하는가 | 스타일 이름 → ID 해석 후 적용, 재로드 후 확인 | 스타일 이름 일치 | rhwp-adapter |
| S-04 | `insertPictureEx`가 PNG/JPG/SVG를 받는가, 크기 단위는 | 이미지 3종 삽입 | 렌더/재로드 성공 | mermaid |
| S-05 | `createTable(Ex)` + 셀 텍스트 입력 + 머리행 서식 | 3×3, 큰 표 | 구조·텍스트 일치, 쪽 넘김 | md-element-mapping |
| S-06 | 목록: 한글 번호/글머리표를 어떻게 적용하는가 | `createNumbering`, 스타일 기반 비교 | 중첩 3단계 | md-element-mapping |
| S-07 | 문서 끝에 순차 추가하는 방법(문단 인덱스·오프셋 관리) | `insertParagraph`/`splitParagraph` 반복 | 1,000문단 정상 | rhwp-adapter |
| S-08 | 인라인 서식(굵게 등) 구간 적용 | `applyCharFormat` | 재로드 후 유지 | md-element-mapping |
| S-09 | 각주 삽입 | `insertFootnote` | 재로드 후 유지 | FR-08 |
| S-10 | 본문 시작 위치 지정(책갈피/필드/검색 치환) | `getBookmarks`, `replaceAll` | 위치 정확 | style-map-spec |
| S-11 | 글꼴 메트릭 기반 `measureTextWidth` 적용 시 쪽수 정확도 | 근사 vs 메트릭 vs 브라우저 결과 비교 | 쪽수 일치율 | L-02, ADR-0003 |
| S-12 | 대용량(1,000문단) 시 성능과 `beginDeferredPagination` 효과 | 시간 측정 | NFR-06 충족 | test-strategy |
| S-13 | Worker + OffscreenCanvas에서 `measureTextWidth` 동작 | 브라우저 테스트 | 동작 여부 | web-ui |
| S-14 | `exportHwp` 반환 형태(`Uint8Array` vs `DocumentExport`)와 `contentLoss` 사용법 | 타입/런타임 확인 | 어댑터 정규화 | L-09 |

## 진행 방식
1. 샘플 양식을 한글에서 제작하거나 제공받는다(없으면 S-01~S-03은 `createStyle`로 만든 스타일로 대체 검증하고 한계를 기록).
2. `spike/` 디렉터리에 항목별 스크립트(`s01-*.mjs` …)를 두고, 실행 결과를 표로 갱신한다.
3. 완료 후 `[검증 필요]` 표시를 제거하고 영향 문서를 갱신한다.
4. 실패 항목은 대안(스타일 대신 직접 서식, 이미지 대체 등)을 ADR로 기록한다.
