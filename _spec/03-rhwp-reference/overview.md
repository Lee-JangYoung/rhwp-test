# rhwp 개요 (참조)

> 기준: 2026-10-14 조회, `@rhwp/core@0.8.7`, `@rhwp/editor@0.8.7` 패키지의 README와 타입 정의.

## 버전

| 항목 | 값 |
|---|---|
| `@rhwp/core` latest | 0.8.7 (2026-10-06) |
| `@rhwp/editor` latest | 0.8.7 (2026-10-06) |
| 라이선스 | MIT |
| 저장소 | https://github.com/edwardkim/rhwp |
| 온라인 데모 | https://edwardkim.github.io/rhwp/ |
| 소스 빌드 요구 | Rust 1.93.1, Docker(WASM 빌드), Node.js 18+ |

본 프로젝트는 **0.8.7로 고정**한다([ADR-0005](../adr/0005-pin-rhwp-and-isolate-adapter.md)). README에 따르면 0.x 단계라 편집 API 시그니처가 바뀔 수 있으며 변경은 CHANGELOG의 `### API` 항목에 기록된다.

## 패키지

| 패키지 | 용도 | 본 프로젝트 사용 |
|---|---|---|
| `@rhwp/core` | WASM 파서/렌더러/편집 API (`HwpDocument`) | **핵심 의존성** |
| `@rhwp/editor` | iframe 에디터 임베드 (`createEditor`, `createStudio`) | 웹 UI 선택 기능(미리보기·편집) |
| `rhwp` 바이너리 | CLI(`export-svg/png/pdf`, `dump`, `info`), MCP 서버 | 검증·미리보기 보조 |

## 실행 환경

- **브라우저**: `await init({ module_or_path: '/rhwp_bg.wasm' })`
- **Node**: `initSync({ module: fs.readFileSync('rhwp_bg.wasm') })` — 0.8.7에서 동작 확인(스파이크).
- **공통 필수 조건**: `globalThis.measureTextWidth(font, text)`를 init 전에 등록해야 한다. 글자 폭 측정을 호스트에 위임하기 때문이다.

## 확인된 동작 (Node 스파이크, 2026-10-14)

| 시나리오 | 결과 |
|---|---|
| `HwpDocument.createEmpty()` → `insertText` → `exportHwp()` → `new HwpDocument(bytes)` | 성공, 텍스트 보존 (S-00) |
| `createTable(0,0,0,3,2)` 후 `getControls()`, `getTableDimensions`, `getCellInfo` | 표 컨트롤, `{rowCount:3,colCount:2}`, 셀의 행·열·병합 정보 반환 (R-01 일부). 저장·재로드 후 표 위치 해석은 미확인 |
| `createEmpty()` 문서의 `getStyleList()` | 빈 배열 → 스타일이 있는 양식 파일이 필요 |
| 근사 `measureTextWidth` 사용 | 동작은 하나 레이아웃 정확도는 별도 검증 필요 |
