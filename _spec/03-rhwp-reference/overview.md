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
- **README 요구**: `globalThis.measureTextWidth(font, text)`를 init 전에 등록(글자 폭 측정을 호스트에 위임). 단 Node 시험에서는 호출되지 않아 실제 경로는 확인 필요(S-11).

## 확인된 동작 (Node 스파이크, 2026-10-14)

| 시나리오 | 결과 |
|---|---|
| `HwpDocument.createEmpty()` → `insertText` → `exportHwp()` → `new HwpDocument(bytes)` | 성공, 텍스트 보존 (S-00) |
| `createTable(0,0,0,3,2)` 후 `getControls()`, `getTableDimensions`, `getCellInfo` | 표 컨트롤, `{rowCount:3,colCount:2}`, 셀의 행·열·병합 정보 반환 (R-01 일부). 저장·재로드 후 표 위치 해석은 미확인 |
| `createEmpty()` 문서의 `getStyleList()` | 빈 배열 → 스타일이 있는 양식 파일이 필요 |
| HWP·HWPX 저장 → 재로드·재저장·교차 저장 (텍스트·표·누름틀) | 모두 동일, 손실 0건 (S-02 부분) |
| 번들 템플릿 문서의 HWPX 글꼴 정보 | 글꼴 **이름만** 기록(함초롬돋움·함초롬바탕), 7개 언어 카테고리별 정의, 글꼴 파일은 포함되지 않음. 줄 배치(`lineseg`)가 파일에 저장됨 |
| `renderPageSvg`의 글꼴 | `font-family`에 HWP 글꼴명을 앞세운 폴백 체인(예: 함초롬바탕 → Batang → 바탕 → Nanum Myeongjo → Noto Serif KR …) |
| `measureTextWidth` | Node 시험에서 **호출되지 않음** — 폭 계산 경로 확인 필요 (S-11) |
