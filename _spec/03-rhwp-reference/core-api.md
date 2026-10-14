# 사용 API (`@rhwp/core@0.8.7`)

`HwpDocument`는 메서드가 약 468개다. 전체 시그니처는 패키지의 `rhwp.d.ts`를 따르고, 여기에는 **본 프로젝트가 쓸 후보와 검증 상태**만 둔다.

## 규칙
- 위치는 `(sec, para, charOffset)`. 표 셀은 `...InCell`/`...InCellByPath`, 머리말·꼬리말은 `...InHeaderFooter`, 각주는 `...InFootnote`.
- 편집 메서드는 JSON 문자열을 반환한다(예: `{"ok":true,"charOffset":12}`).
- 인자가 많으면 `*Ex(optionsJson)` 변형을 쓴다(키 camelCase, 이미지 바이트는 별도 인자).

## 후보와 상태

| 용도 | 메서드 | 상태 |
|---|---|---|
| 초기화 | `init`, `initSync`, `version()` | 확인됨 (Node `initSync`) |
| 문서 열기/생성 | `new HwpDocument(bytes)`, 정적 `createEmpty()` | 확인됨 |
| 문서 생성(번들 템플릿) | 인스턴스 `createBlankDocument(): string` | 미검증 (S-15) |
| 양식 구조 조회 | `getControls`, `getTableDimensions`, `getCellInfo`(병합 정보), `getStructure(mode)` | 일부 확인 (R-01) |
| 쪽수/텍스트 | `pageCount()`, `getPageText(n)`, `getParagraphCount(sec)` | 확인됨 |
| 텍스트 | `insertText(sec,para,off,text)` | 확인됨 |
| 문단 | `insertParagraph`, `splitParagraph` | 미검증 (S-07) |
| 스타일 | `getStyleList`, `applyStyle`, `createStyle` | 미검증 (S-01, S-03). 빈 문서는 목록이 빔 |
| 글자/문단 서식 | `applyCharFormat`, `applyParaFormat` | 미검증 (S-08) |
| 표 | `createTable(Ex)`, `insertTextInCell(ByPath)`, `mergeTableCells` | 미검증 (S-05) |
| 그림 | `insertPictureEx` | 미검증 (S-04) |
| 목록 | `createNumbering`, `ensureDefaultNumbering`, `ensureDefaultBullet` | 미검증 (S-06) |
| 각주/쪽 나눔 | `insertFootnote`, `insertPageBreak` | 미검증 (S-09) |
| 필드 | `getFieldList`, `setFieldValueByName` | 미검증 (S-01) |
| 책갈피/치환 | `getBookmarks`, `replaceAll` | 미검증 (S-10) |
| 저장 | `exportHwp()` | 확인됨 |
| 저장 | `exportHwpx()`, `exportHwp(x)WithReport`, `exportHwpVerify()` | 미검증 (S-02, S-14) |
| 미리보기 | `renderPageSvg(n)` | 확인됨 |
| 성능 | `beginDeferredPagination`, `flushDeferredPagination` | 미검증 (S-12) |
| 해제 | `free()` | |
