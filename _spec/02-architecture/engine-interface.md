# 엔진 인터페이스

결정: [ADR-0009](../adr/0009-engine-interface.md), [ADR-0005](../adr/0005-pin-rhwp-and-isolate-adapter.md)

나중에 라이브러리를 바꿔도 코어가 흔들리지 않도록, 문서를 열고 편집·저장하는 부분을 **엔진 인터페이스**로 분리한다. 첫 구현체는 rhwp다. 코어는 이 인터페이스만 알고 `@rhwp/core`를 import하지 않는다(import는 `engines/rhwp`에서만).

## 인터페이스 (제안, 최소)

```ts
interface DocumentEngine {
  id: string;                      // 'rhwp'
  version: string;
  open(template?: Uint8Array): Promise<DocumentSession>;   // 없으면 번들 템플릿 기반 빈 문서
}

interface DocumentSession {
  analyze(): TemplateAnalysis;                  // 스타일·필드·책갈피·표 구조(병합 포함)
  setField(name: string, value: string): void;
  appendParagraph(o: { style?: string; inlines: RunSpec[] }): Ref;
  appendTable(o: TableSpec): Ref;
  appendImage(o: { bytes: Uint8Array; ext: string; widthPx: number; heightPx: number }): Ref;
  cloneBlock(block: Ref, count: number): Ref[]; // 반복 블록
  replace(find: string, to: string, scope: 'all' | 'first'): number;
  export(format: 'hwpx' | 'hwp'): { bytes: Uint8Array; lossy: boolean; warnings: string[] };
  pageCount(): number;
  renderSvg(page: number): string;
  dispose(): void;
}
```

- 기본 출력은 `hwpx`([ADR-0010](../adr/0010-hwpx-first-output.md)). `hwp`는 후순위.
- `Ref`는 엔진이 발급하는 불투명 참조다. 구역·문단·오프셋 같은 위치는 엔진 안에 둔다.
- 엔진이 지원하지 못하는 연산은 예외 대신 `warnings`나 명시적 오류로 알린다.

## rhwp 구현 매핑 (검증된 것만)

| 인터페이스 | rhwp |
|---|---|
| `open` | `new HwpDocument(bytes)` / `createEmpty()` + `createBlankDocument()` |
| `analyze` | `getControls`, `getTableDimensions`, `getCellInfo`, `getStyleList`, `getFieldList`, `getBookmarks` |
| `setField` | `setFieldValueByName` |
| `appendParagraph` | `insertParagraph` + `insertText` (스타일 적용은 `applyStyle` 미검증) |
| `appendTable` | `createTable` + `insertTextInCell` |
| `appendImage` | `insertPictureEx` |
| `cloneBlock` | `importParagraphBlock`(`count`) 또는 `copyControl`+`pasteControl` |
| `replace` | `replaceAll` / `replaceOne`(본문만) |
| `export` | `exportHwpx` / `exportHwp`, 손실은 `*WithReport`, 검증은 `exportHwpVerify` |
| `renderSvg` | `renderPageSvg` |

## 교체 방법
1. 새 엔진을 `DocumentEngine`으로 구현한다.
2. 엔진 공통 테스트(편집 → 저장 → 재로드 왕복, 블록 반복, 표 채움, 필드)를 통과시킨다.
3. 설정(`engine`)으로 선택한다. 한 문서는 한 엔진으로만 처리한다.

## 구현 시 유의
- rhwp는 편집 API가 JSON 문자열을 반환하므로 `ok`를 검사하고 실패를 경고/오류로 변환한다.
- "문서 끝에 추가" 헬퍼가 필요하다(위치 지정이 `(sec, para, charOffset)`).
- 인자가 많은 API는 `*Ex(optionsJson)` 변형을 우선한다.
