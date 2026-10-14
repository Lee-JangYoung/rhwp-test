# 용어집

| 용어 | 설명 |
|---|---|
| HWP | 한컴 한글 5.0 바이너리 포맷 |
| HWPX | 한글의 ZIP + XML 기반 개방형 포맷(OWPML) |
| HML | 한글 XML(HWPML) 포맷. rhwp는 제한적으로 지원 |
| rhwp | Rust + WASM 기반 오픈소스 HWP/HWPX 파서·렌더러·에디터 |
| `@rhwp/core` | rhwp의 WASM 파서/렌더러 npm 패키지 (`HwpDocument` 등) |
| `@rhwp/editor` | iframe 기반 에디터 임베드 패키지 |
| 양식 / 템플릿 | 스타일, 쪽 설정, 머리말/꼬리말, 표지가 정의된 HWP/HWPX 파일 |
| 스타일 | 한글의 문단·글자 서식 묶음(예: 개요 1, 바탕글) |
| 누름틀(필드) | 값을 채울 수 있는 입력 위치. API에서는 field |
| style-map | Markdown 요소와 양식 스타일 이름의 매핑 파일(`style-map.yaml`) |
| IR | 중간표현. Markdown AST를 변환기 내부용으로 단순화한 구조 |
| 어댑터 | rhwp API 호출을 한 곳에 모은 계층 |
| `*Ex` 변형 | rhwp 편집 API 중 인자를 JSON 문자열로 받는 변형(예: `insertPictureEx`) |
| ADR | Architecture Decision Record, 설계 결정 기록 |
| SSOT | Single Source of Truth, 단일 출처 |
