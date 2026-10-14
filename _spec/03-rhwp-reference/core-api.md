# 사용 API 부분집합 (`@rhwp/core@0.8.7`)

`HwpDocument`는 약 468개 메서드를 갖는다. 본 프로젝트가 사용할 후보만 정리한다. 시그니처 전체는 패키지의 `rhwp.d.ts`를 따른다.
`[검증 필요]`는 이름은 존재하나 동작·인자를 스파이크로 확인해야 하는 항목이다.

## 규칙
- 위치: `(sec, para, charOffset)`. 표 셀 내부는 `...InCell`/`...InCellByPath`, 머리말/꼬리말 `...InHeaderFooter`, 각주 `...InFootnote`.
- 대부분의 편집 메서드는 **JSON 문자열**을 반환한다(예: `{"ok":true,"charOffset":12}`).
- 인자가 많으면 `*Ex(optionsJson)` 변형을 사용한다. 키는 camelCase, 이미지 바이트는 별도 인자.

## 모듈 레벨

| 이름 | 용도 |
|---|---|
| `init` / `initSync` | WASM 초기화 |
| `version()` | 버전 확인 (스파이크: `0.8.7`) |
| `init_panic_hook()` | panic 로그 |
| `extractThumbnail(bytes)` | 썸네일 추출 |

## 문서 수명

| 메서드 | 용도 | 상태 |
|---|---|---|
| `new HwpDocument(bytes)` | 템플릿/기존 문서 열기 | 확인됨 |
| `createBlankDocument()` / `createEmpty()` | 빈 문서 생성 | 확인됨 |
| `openWithPassword` | 암호 문서 | 미사용 예정 |
| `free()` | 해제 | |

## 정보 조회

| 메서드 | 용도 |
|---|---|
| `pageCount()` | 쪽수 (확인됨) |
| `getPageText(page)` | 쪽 텍스트 (확인됨) |
| `getParagraphCount(sec)` | 문단 수 (확인됨) |
| `getSectionCount()` | 구역 수 |
| `getStyleList()` | 양식 스타일 목록 [검증 필요: 양식에서의 반환 형태] |
| `getFieldList()` | 누름틀 목록 [검증 필요] |
| `getDocumentInfo()`, `getPageInfo()`, `getSourceFormat()` | 메타 [검증 필요] |
| `getValidationWarnings()` | 로드 경고 [검증 필요] |

## 본문 편집

| 메서드 | 용도 | 상태 |
|---|---|---|
| `insertText(sec, para, off, text)` | 텍스트 삽입 | 확인됨 |
| `insertParagraph` / `splitParagraph` | 문단 추가/분할 | [검증 필요] |
| `applyStyle` | 스타일 적용 | [검증 필요] |
| `applyCharFormat` / `applyParaFormat` | 글자/문단 서식 | [검증 필요] |
| `setCharShapeRuns` | 글자 모양 구간 | [검증 필요] |
| `insertPageBreak` | 쪽 나눔 | [검증 필요] |
| `replaceAll` / `searchText` | 자리표시자 치환 | [검증 필요] |

## 표

| 메서드 | 용도 |
|---|---|
| `createTable`, `createTableEx` | 표 생성 (`createTable(sec,para,off,rows,cols)`) |
| `insertTextInCell`, `insertTextInCellByPath` | 셀 텍스트 |
| `mergeTableCells`, `setTableProperties`, `setCellProperties` | 병합, 속성 |
| `getTableDimensions` | 크기 조회 |

## 그림·도형·수식·각주

| 메서드 | 용도 |
|---|---|
| `insertPicture`, `insertPictureEx` | 그림 삽입(바이트는 별도 인자) |
| `setPictureProperties` | 그림 속성 |
| `insertEquation` | 수식 |
| `insertFootnote`, `insertTextInFootnote` | 각주 |

## 필드(누름틀)

| 메서드 | 용도 |
|---|---|
| `getFieldList` | 목록 |
| `setFieldValueByName` / `getFieldValueByName` | 이름으로 값 설정/조회 |
| `setFieldValue` | 위치 기반 |

## 목록(번호/글머리표)

`createNumbering`, `ensureDefaultNumbering`, `ensureDefaultBullet`, `getNumberingList`, `getBulletList` — Markdown 목록을 한글 번호 매기기로 연결하는 방법은 스파이크로 확정한다.

## 저장·검증

| 메서드 | 용도 |
|---|---|
| `exportHwp()` | HWP 저장 (확인됨) |
| `exportHwpx()` | HWPX 저장 [검증 필요] |
| `exportHwpWithReport` / `exportHwpxWithReport` | 손실 보고 포함 저장 [검증 필요] |
| `exportHwpVerify()` | 직렬화 + 재로드 검증 메타 |
| `DocumentExport` | `hasBytes()`, `takeBytes()`, `contentLoss()` |

## 렌더링

| 메서드 | 용도 |
|---|---|
| `renderPageSvg(page)` | SVG (확인됨) |
| `renderPageToCanvas`, `renderPageHtml` | 브라우저 미리보기 |

## 되돌리기·일괄

`saveSnapshot`/`restoreSnapshot`/`discardSnapshot`, `beginBatch`/`endBatch`, `beginDeferredPagination`/`flushDeferredPagination` — 대용량 문서에서 재조판 비용을 줄이는 데 쓸 후보다. `*DeferredPagination` 변형 메서드도 있다. [검증 필요: 성능 효과]
