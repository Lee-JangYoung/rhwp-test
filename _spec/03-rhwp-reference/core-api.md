# 사용 API (`@rhwp/core@0.8.7`)

`HwpDocument`는 메서드가 약 468개다. 전체 시그니처는 패키지의 `rhwp.d.ts`를 따르고, 여기에는 **본 프로젝트가 쓸 후보와 검증 상태**만 둔다. 상태의 근거는 [verification-spike.md](../06-quality/verification-spike.md).

## 규칙
- 위치는 `(sec, para, charOffset)`. 표 컨트롤의 문단 번호는 `getControls()`의 `para`/`controlIndex`로 확인한다(표가 0번 문단에 있다고 가정하지 않는다). 표 셀은 `...InCell`/`...InCellByPath`.
- 편집 메서드는 JSON 문자열을 반환한다(예: `{"ok":true,"charOffset":12}`). `ok`를 확인한다.
- 인자가 많으면 `*Ex(optionsJson)` 변형을 쓴다(키 camelCase, 이미지 바이트는 별도 인자).
- 0번 문단은 구역 정의·단 정의를 가져 블록 복제 대상에서 제외한다.

## 후보와 상태

| 용도 | 메서드 | 상태 |
|---|---|---|
| 초기화 | `init`, `initSync`, `version()` | 확인됨 (Node `initSync`) |
| 문서 열기 | `new HwpDocument(bytes)` — HWP·HWPX 모두 | 확인됨 |
| 문서 생성 | 정적 `createEmpty()` 후 인스턴스 `createBlankDocument()` (번들 템플릿: 스타일·구역 정의 포함) | 확인됨(S-15 부분) |
| 쪽수/텍스트 | `pageCount()`, `getPageText(n)`, `getParagraphCount(sec)`, `getDocumentInfo()`, `getSourceFormat()` | 확인됨 |
| 양식 분석 | `getControls`, `getTableDimensions`, `getCellInfo`(병합), `getStyleList`, `getFieldList`, `getBookmarks`, `getStructure(mode)` | 부분 (S-01, R-01) |
| 텍스트 | `insertText(sec,para,off,text)` | 확인됨 |
| 문단 | `insertParagraph(sec,para)`, `splitParagraph` | `insertParagraph` 확인됨, 대량 추가는 미검증 (S-07) |
| 표 | `createTable`, `insertTextInCell`, `insertTableRow`, `deleteTableRow`, `copyControl`+`pasteControl` | 확인됨 |
| 블록 반복 | `importParagraphBlock(source, optionsJson)` (`count`=반복 횟수, `dryRun`) | 확인됨 (R-02 부분) |
| 치환 | `replaceAll`(표 셀 포함), `replaceOne`(본문만) | 확인됨 |
| 누름틀 | `insertClickHereField`, `getFieldList`, `setFieldValueByName` — 저장·재로드 후 값 유지 | 확인됨 |
| 그림 | `insertPictureEx(optionsJson, bytes)` — PNG | 확인됨 (S-04 부분) |
| 스타일 | `applyStyle`, `createStyle` | 미검증 (S-03) |
| 글자/문단 서식 | `applyCharFormat`, `applyParaFormat` | 미검증 (S-08) |
| 목록 | `createNumbering`, `ensureDefaultNumbering`, `ensureDefaultBullet` | 미검증 (S-06) |
| 각주/쪽 나눔 | `insertFootnote`, `insertPageBreak` | 미검증 (S-09) |
| 저장 | `exportHwpx()`, `exportHwp()` → `Uint8Array`, `exportHwp(x)WithReport()`, `exportHwpVerify()` | 확인됨 (S-14, S-02 부분) |
| 미리보기 | `renderPageSvg(n)` | 확인됨 |
| 성능 | `beginDeferredPagination`, `flushDeferredPagination` | 미검증 (S-12) |
| 해제 | `free()` | |
