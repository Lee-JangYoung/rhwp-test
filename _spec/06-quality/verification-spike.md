# 검증 상태 (단일 출처)

설계의 `[검증 필요]` 항목을 코드로 확정한다. 판정: 성공 / 부분 / 실패 / **미검증**. 결과는 근거(출력)와 함께 이 표를 갱신하고 영향 문서에서 표시를 제거한다.

| ID | 질문 | 판정 | 영향 |
|---|---|---|---|
| S-00 | Node `initSync` + 근사 폭 측정으로 생성 → `insertText` → `exportHwp` → 재로드 | **성공** (2026-10-14) | adr-0003 |
| S-01 | 양식 로드 시 `getStyleList`/`getFieldList`가 쓸 만한 정보를 주는가 | 미검증 | style-map-spec |
| S-02 | `exportHwpx`가 양식 요소(머리말·쪽번호·스타일)를 보존하는가 | 미검증 | known-limitations L-04 |
| S-03 | `applyStyle`로 양식 스타일을 정확히 적용하는가 | 미검증 | adr-0002 |
| S-04 | `insertPictureEx`의 PNG/JPG/SVG 지원과 크기 단위 | 미검증 | ir-spec, mermaid |
| S-05 | 표 생성·셀 텍스트·머리행 서식, 쪽 넘김 | 미검증 | md-element-mapping |
| S-06 | 목록(번호/글머리표) 적용 방법, 3단계 중첩 | 미검증 | md-element-mapping |
| S-07 | 문서 끝에 순차 추가(1,000문단) | 미검증 | rhwp-adapter |
| S-08 | 인라인 서식 구간 적용 | 미검증 | md-element-mapping |
| S-09 | 각주 삽입 | 미검증 | md-element-mapping |
| S-10 | 본문 시작 위치 지정(책갈피/치환) | 미검증 | style-map-spec |
| S-11 | 글꼴 메트릭 기반 폭 측정 시 쪽수 정확도 | 미검증 | adr-0003, L-02 |
| S-12 | 대용량 성능, `beginDeferredPagination` 효과 | 미검증 | architecture |
| S-13 | Worker + OffscreenCanvas 폭 측정 | 미검증 | web-ui |
| S-14 | `exportHwp` 반환 형태와 `contentLoss` 사용법 | 미검증 | rhwp-adapter, L-09 |

## 진행 방식
`spike/`에 항목별 스크립트(`s01-*.mjs` …)를 두고 결과로 이 표를 갱신한다. S-01~S-03, S-10은 샘플 양식이 필요하다(없으면 `createStyle`로 만든 스타일로 대체 검증하고 한계를 적는다). 실패 항목은 대안을 ADR로 남긴다.

## 테스트 방침 (구현 단계)
- 단위: 파서·IR·스타일 매핑·렌더 계획(rhwp 불필요, Vitest)
- 어댑터: 실제 WASM으로 편집 → 저장 → 재로드 왕복
- 통합: `examples/` md를 변환해 골든과 비교 — 바이트가 아니라 쪽수, 쪽별 텍스트, 문단 스타일, 표 구조, 필드 값, 손실 여부
- 한컴 뷰어에서 열림 확인은 릴리스 전 수동 체크
