# 엔진 인터페이스

결정: [ADR-0009](../adr/0009-engine-interface.md), [ADR-0005](../adr/0005-pin-rhwp-and-isolate-adapter.md)

나중에 라이브러리를 바꿔도 코어가 흔들리지 않도록, 문서를 열고 편집·저장하는 부분을 **엔진 인터페이스**로 분리한다. 첫 구현체는 rhwp다. 코어는 이 인터페이스만 알고 `@rhwp/core`를 import하지 않는다(import는 `engines/rhwp`에서만).

## 인터페이스 (현재: `packages/core/src/engine/types.ts`)
코어가 쓰는 연산만 둔다. 위치는 `TableRef{para, ctrl}`로 표현하고 구역·오프셋은 엔진 안에 둔다. 채움형 변환([ADR-0012](../adr/0012-repeat-block-by-table-clone.md))에 필요한 연산으로 확정됐고, 처음 제안했던 `appendParagraph`·`appendTable` 같은 문서 조립형 연산은 쓰지 않는다.

```ts
interface DocumentEngine { id; version; open(template?: Uint8Array): Promise<DocumentSession> }  // 없으면 번들 템플릿 기반 빈 문서
```

| 연산 | 용도 | rhwp |
|---|---|---|
| `analyze()` | 양식 사실(표·필드·스타일·글꼴·컨트롤 수) | `getControls`, `getTableDimensions`, `getFieldList`, `getStyleList`, `getDocumentInfo` |
| `setField`, `getField` | 누름틀 | `setFieldValueByName`, `getFieldValueByName` |
| `topTables()`, `tableCells(t)`, `setCellText(t, idx, text)` | 표 찾기·셀 읽기·채움 | `getControls`(캐시), `getCellInfo`, `deleteTextInCell`·`insertTextInCell`·`splitParagraphInCell` |
| `cloneTableAfter(src, after)` | 반복 블록 복제 | `copyControl` + `insertParagraph` + `pasteControl` |
| `insertRowsAfter`, `deleteRow`, `deleteTable` | 행 목록·조건부 삭제 | `insertTableRow`, `deleteTableRow`, `deleteTableControl` |
| `replaceText(query, text)` | 토큰 치환(표 셀 포함) | `replaceAll` (`replaceOne`은 표 셀에서 동작하지 않음) |
| `bodyParagraphs()`, `findParagraph(q)`, `setParagraphLines(p, lines)` | 본문 문단 편집 | `getParagraphCount`·`getTextRange`·`searchText`, `splitParagraph`·`deleteText`·`insertText` |
| `insertImageAfter(t, img)` | 그림 삽입(글자처럼 취급으로 고정) | `insertPictureEx` + `setPictureProperties` |
| `setTablePageBreak`, `fitTableHeights()` | 쪽 나눔, 표 높이 맞춤(L-14·L-15) | `setTableProperties`, `setCellProperties`, `getTableCellBboxes`(1회 조회) |
| `batch(f)` | 편집 묶음에서 조판 생략(대형 문서 57 s → 1 s, S-28) | `beginBatch`/`endBatch` |
| `tableLayouts()`, `pictureLayouts()`, `controlCounts()`, `bodyText()`, `pageCount()` | 저장 후 자체 검증 | 조회 API |
| `renderSvg(page)` | 미리보기 | `renderPageSvg` |
| `export()` | **HWPX** 바이트 | `exportHwpx` |
| `exportHwp()` | **HWP 5.0**(CFB) 바이트. HWPX에서 연 문서는 HWPX→HWP 어댑터가 자동 적용 | `exportHwp` |
| `dispose()` | 해제 | `free` |

- 엔진 생성은 환경 초기화를 주입받는다: `createRhwpEngine(init)`([ADR-0011](../adr/0011-core-adapter-split-by-injection.md)).
- 지원하지 못하는 연산은 예외 대신 명시적 오류나 경고로 알린다.
- 포맷 파생은 두 가지다([ADR-0019](../adr/0019-multi-format-output.md)): `export*`처럼 엔진이 직접 저장하는 포맷, 그리고 엔진 없이 md 데이터 트리에서 만드는 포맷(이 인터페이스 밖).

## 교체 방법
1. 새 엔진을 `DocumentEngine`으로 구현한다.
2. 엔진 공통 테스트(편집 → 저장 → 재로드 왕복, 블록 반복, 표 채움, 필드)를 통과시킨다.
3. 설정(`engine`)으로 선택한다. 한 문서는 한 엔진으로만 처리한다.

## 구현 시 유의
- rhwp는 편집 API가 JSON 문자열을 반환하므로 `ok`를 검사하고 실패를 경고/오류로 변환한다.
- 0번 문단은 구역 정의를 가져 블록 복제 대상에서 제외한다. 표 위치는 `getControls()`로 확인한다(느리므로 목록을 캐시).
- 인자가 많은 API는 `*Ex(optionsJson)` 변형을 우선한다.
