# 아키텍처

결정: [ADR-0001](../adr/0001-monorepo-core-cli-web.md), [ADR-0003](../adr/0003-environment-agnostic-core.md), [ADR-0005](../adr/0005-pin-rhwp-and-isolate-adapter.md), [ADR-0006](../adr/0006-template-registration-and-doctype-profile.md), [ADR-0007](../adr/0007-llm-by-host-agent-conversion-llm-free.md), [ADR-0008](../adr/0008-core-with-cli-mcp-web-adapters.md), [ADR-0009](../adr/0009-engine-interface.md), [ADR-0010](../adr/0010-hwpx-first-output.md)

## 패키지

| 패키지 | 책임 |
|---|---|
| `core` | 양식 분석, 프로필 로드·검증, md 파싱, IR, 렌더 계획, 변환, 검증. rhwp 호출은 엔진 인터페이스 뒤(`engines/rhwp`)에만([engine-interface.md](engine-interface.md)) |
| `cli` | 인자 처리, 파일 I/O, Mermaid 렌더(`mermaid-cli`), 리포트 출력 |
| `mcp` | LLM 에이전트용 도구 노출(stdio) |
| `web` | 프로필 선택, 업로드/다운로드, SVG 미리보기 (후순위) |

스택(제안): TypeScript, pnpm workspace, Vitest, remark/unified, yaml, Vite.
프로필 저장·관리와 다중 사용자(서버) 제공 방식은 **미결**이다.

## 두 흐름

```
[등록] 샘플 양식 → 분석(core) → 해석 초안(호스트 LLM) → 스키마 검증·조립(core) → 사람 승인 → 프로필
[변환] md → ① parse → ② normalize(IR) → ③ preprocess(Mermaid→이미지) → ④ plan(프로필 적용)
         → ⑤ execute(엔진: 양식 로드·필드·본문·스타일) → ⑥ export(HWPX) → ⑦ verify
```

- 등록·변환 모두 ①~④와 분석은 rhwp와 무관한 순수 함수(단위 테스트 용이), ⑤⑥과 양식 분석의 rhwp 조회만 엔진에 의존한다.
- 변환 경로에는 LLM이 없다([ADR-0007](../adr/0007-llm-by-host-agent-conversion-llm-free.md)). 상세: [doctype-profile.md](../04-conversion/doctype-profile.md)

## 환경 주입

| 항목 | CLI/MCP(Node) | 웹 |
|---|---|---|
| WASM 로드 | `initSync({module: bytes})` | `init({module_or_path})` |
| `measureTextWidth` | 폭 계산 경로 확인 필요 (S-11) | Canvas 2D `measureText` |
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
