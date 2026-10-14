# 아키텍처

결정: [ADR-0001](../adr/0001-monorepo-core-cli-web.md), [ADR-0003](../adr/0003-environment-agnostic-core.md), [ADR-0005](../adr/0005-pin-rhwp-and-isolate-adapter.md)

## 패키지

| 패키지 | 책임 |
|---|---|
| `core` | 파싱, IR, 스타일 매핑, 렌더 계획, 검증. rhwp 호출은 `core/adapter`에만 |
| `cli` | 인자 처리, 파일 I/O, Mermaid 렌더(`mermaid-cli`), 리포트 출력 |
| `web` | UI, 업로드/다운로드, SVG 미리보기 |

스택(제안): TypeScript, pnpm workspace, Vitest, remark/unified, yaml, Vite.

## 데이터 흐름

```
input.md
 ① parse      remark, front-matter 분리
 ② normalize  IR 생성, 에셋 수집
 ③ preprocess Mermaid → 이미지 (환경별 주입)
 ④ plan       style-map 적용 → 렌더 명령
 ⑤ execute    어댑터: 양식 로드 → 필드 → 본문 → 스타일
 ⑥ export     HWP / HWPX
 ⑦ verify     재로드, 쪽수·텍스트 비교, 손실 확인
```

①~④는 rhwp와 무관한 순수 함수(단위 테스트 용이), ⑤⑥만 어댑터에 의존한다.

## 환경 주입

| 항목 | CLI(Node) | 웹 |
|---|---|---|
| WASM 로드 | `initSync({module: bytes})` | `init({module_or_path})` |
| `measureTextWidth` | 글꼴 메트릭/canvas 라이브러리 | Canvas 2D `measureText` |
| 에셋 읽기 | `fs` | `File`/`fetch` |
| 다이어그램 | `mermaid-cli` | 브라우저 mermaid |

```ts
interface Env {
  loadWasm(): Promise<void>;
  measureTextWidth(font: string, text: string): number;
  readAsset(ref: string): Promise<Uint8Array>;
  renderDiagram?(kind: string, source: string): Promise<{ bytes: Uint8Array; ext: 'png' | 'svg' }>;
}
```

## 오류 원칙
미지원 요소와 없는 스타일은 실패 대신 경고로 보고하고 대체 처리한다(`--strict`면 실패). 저장 손실은 리포트에 포함한다.
