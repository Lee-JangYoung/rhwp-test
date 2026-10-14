# 아키텍처

관련 결정: [ADR-0001](../adr/0001-monorepo-core-cli-web.md), [ADR-0003](../adr/0003-environment-agnostic-core.md), [ADR-0005](../adr/0005-pin-rhwp-and-isolate-adapter.md)

## 패키지 구조 (모노레포)

```
packages/
  core/     # Markdown → IR → 어댑터 호출. Node/브라우저 공통
  cli/      # md2hwp (Node)
  web/      # Vite 웹 UI
templates/  # 양식 파일과 style-map.yaml
examples/   # 샘플 md, 기대 결과
```

| 패키지 | 책임 | 의존 |
|---|---|---|
| `core` | 파싱, IR 생성, 스타일 매핑, 렌더 계획 수립, 검증 | `remark` 계열, `yaml`, rhwp 어댑터 |
| `core/adapter` | `@rhwp/core` 호출 전부 | `@rhwp/core` |
| `cli` | 인자 처리, 파일 I/O, Mermaid 렌더링, 리포트 출력 | `core` |
| `web` | UI, 업로드/다운로드, 미리보기 | `core` |

## 데이터 흐름

```
input.md
  │ ① parse        (remark, front-matter 분리)
  ▼
mdast + meta
  │ ② normalize    (IR 생성: 요소 단순화, 에셋 수집)
  ▼
IR (ir-spec.md)
  │ ③ preprocess   (Mermaid → 이미지, 이미지 크기 계산)   ← 환경별 주입
  ▼
IR + assets
  │ ④ plan         (style-map 적용 → 렌더 명령 목록)
  ▼
RenderPlan
  │ ⑤ execute      (rhwp 어댑터: 템플릿 로드 → 필드 → 본문 → 스타일)
  ▼
HwpDocument
  │ ⑥ export       (HWP / HWPX)
  ▼
bytes + Report
  │ ⑦ verify       (재로드, 쪽수/텍스트 비교, contentLoss)
  ▼
output.hwp|hwpx + report.json (+ preview.svg|pdf)
```

- ①~④는 rhwp를 쓰지 않는 **순수 함수**라 단위 테스트가 쉽다.
- ⑤⑥만 rhwp 어댑터에 의존한다.
- ③은 환경별로 달라 **주입**한다(CLI: `mermaid-cli`, 웹: 브라우저 렌더 또는 사전 변환).

## 환경 주입 포인트

| 주입 항목 | CLI(Node) | 웹(브라우저) |
|---|---|---|
| WASM 로더 | `initSync({module: fs.readFileSync(...)})` | `init({module_or_path: '/rhwp_bg.wasm'})` |
| `measureTextWidth` | canvas 라이브러리 또는 글꼴 메트릭 기반 | Canvas 2D `measureText` |
| 파일 접근 | `fs` | `File`/`fetch` |
| 다이어그램 렌더러 | `mermaid-cli`(Chromium) | 브라우저 내 mermaid |

```ts
// core가 요구하는 환경 인터페이스 (제안)
interface Env {
  loadWasm(): Promise<void>;
  measureTextWidth(font: string, text: string): number;
  readAsset(ref: string): Promise<Uint8Array>;
  renderDiagram?(kind: string, source: string): Promise<{ bytes: Uint8Array; ext: 'png' | 'svg' }>;
}
```

## 오류 처리 원칙
- 미지원 요소는 **실패하지 않고 경고로 보고**하며 대체 처리한다(`--strict`면 실패).
- 스타일 이름이 양식에 없으면 기본 스타일로 대체하고 경고한다.
- 저장 손실(`contentLoss`)이 있으면 리포트에 포함한다.

## 기술 스택 (제안)
TypeScript, pnpm workspace, Vitest, remark/unified, yaml, Vite(web).
