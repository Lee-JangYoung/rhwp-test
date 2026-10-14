# rhwp 어댑터

관련 결정: [ADR-0005](../adr/0005-pin-rhwp-and-isolate-adapter.md)

## 목적
`@rhwp/core`는 0.x라 시그니처가 바뀔 수 있다. rhwp 호출을 **어댑터 한 곳**에 모아 영향 범위를 제한한다. `core`의 다른 모듈은 `@rhwp/core`를 import하지 않는다.

## 인터페이스 (제안)

```ts
interface HwpWriter {
  open(template?: Uint8Array): Promise<void>;       // 템플릿 없으면 빈 문서
  styles(): StyleInfo[];                            // 양식에 정의된 스타일 목록
  fields(): FieldInfo[];                            // 양식의 누름틀 목록
  setField(name: string, value: string): void;

  appendParagraph(opts: { style?: string; inlines: RunSpec[] }): Cursor;
  appendTable(opts: TableSpec): Cursor;
  appendImage(opts: { asset: Asset; width?: Length; style?: string }): Cursor;
  appendList(opts: ListSpec): Cursor;
  insertFootnote(at: Cursor, text: string): void;
  pageBreak(): void;

  export(format: 'hwp' | 'hwpx'): { bytes: Uint8Array; lossy: boolean; warnings: string[] };
  pageCount(): number;
  pageText(page: number): string;
  renderSvg(page: number): string;
  dispose(): void;
}
```

## 책임 분담

| 책임 | 어댑터 | core(그 외) |
|---|---|---|
| 구역/문단 인덱스, 문자 오프셋 계산 | O | |
| rhwp JSON 문자열 응답 파싱 | O | |
| 스타일 이름 → 스타일 ID 해석 | O | |
| 어떤 스타일을 쓸지 결정 | | O (style-map) |
| 오류를 경고/예외로 변환 | O | |
| 반환 형태 정규화(`Uint8Array` 등) | O | |

## 구현 시 유의
- 위치 지정은 `(sec, para, charOffset)`이므로 "문서 끝에 추가" 헬퍼를 어댑터에 둔다.
- 표 셀 내부 편집은 `...InCell`/`...InCellByPath` 변형을 사용한다.
- 인자가 많은 API는 `*Ex(optionsJson)` 변형을 우선 사용한다.
- 모든 편집 호출 결과(JSON 문자열)의 `ok` 필드를 검사한다. Node 스파이크에서 `insertText`는 `{"ok":true,"charOffset":N}`을 반환했다.
- `HwpDocument`는 `free()`로 해제한다(`dispose`).
- 어댑터 단위 테스트는 실제 WASM을 로드해 왕복(편집 → 저장 → 재로드)으로 검증한다.
