# rhwp 어댑터

결정: [ADR-0005](../adr/0005-pin-rhwp-and-isolate-adapter.md)

`@rhwp/core`는 0.x라 시그니처가 바뀔 수 있다. rhwp 호출은 이 계층에만 두고, `core`의 다른 모듈은 `@rhwp/core`를 import하지 않는다.

## 인터페이스 (제안)

```ts
interface HwpWriter {
  open(template?: Uint8Array): Promise<void>;
  styles(): StyleInfo[];
  fields(): FieldInfo[];
  setField(name: string, value: string): void;
  appendParagraph(o: { style?: string; inlines: RunSpec[] }): void;
  appendTable(o: TableSpec): void;
  appendImage(o: { asset: Asset; width?: number }): void;
  appendList(o: ListSpec): void;
  insertFootnote(text: string): void;
  pageBreak(): void;
  export(format: 'hwp' | 'hwpx'): { bytes: Uint8Array; lossy: boolean; warnings: string[] };
  pageCount(): number;
  renderSvg(page: number): string;
  dispose(): void;
}
```

## 책임
어댑터: 구역/문단/오프셋 계산, JSON 문자열 응답 파싱과 `ok` 검사, 스타일 이름 → ID 해석, 반환 형태 정규화, `free()`.
그 외(`core`): 어떤 스타일을 쓸지 결정(프로필의 `profile.yaml`).

## 구현 시 유의
- "문서 끝에 추가" 헬퍼가 필요하다(위치 지정이 `(sec, para, charOffset)`).
- 인자가 많은 API는 `*Ex(optionsJson)` 변형을 우선한다.
- 단위 테스트는 실제 WASM으로 편집 → 저장 → 재로드 왕복을 검증한다.
