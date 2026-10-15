# 아키텍처

결정: [ADR-0001](../adr/0001-monorepo-core-cli-web.md), [0003](../adr/0003-environment-agnostic-core.md), [0005](../adr/0005-pin-rhwp-and-isolate-adapter.md), [0006](../adr/0006-template-registration-and-doctype-profile.md), [0007](../adr/0007-llm-by-host-agent-conversion-llm-free.md), [0008](../adr/0008-core-with-cli-mcp-web-adapters.md), [0009](../adr/0009-engine-interface.md), [0011](../adr/0011-core-adapter-split-by-injection.md), [0012](../adr/0012-repeat-block-by-table-clone.md), [0013](../adr/0013-runtime-and-package-manager.md), [0016](../adr/0016-profile-format-binding-tree.md), [0017](../adr/0017-llm-in-authoring-only.md), [0019](../adr/0019-multi-format-output.md)

## 패키지

| 경로 | 패키지 | 책임 | rhwp |
|---|---|---|---|
| `packages/core` | `core` | md 읽기, 프로필 형식·점검·가이드, 데이터 트리, 엔진 인터페이스(타입), 프로필 파일 읽기(`/node`) | 모름 |
| `packages/engine-rhwp` | `engine-rhwp` | rhwp 엔진 구현, Node 로더(`/node`). `@rhwp/core`를 여기서만 고정 의존([ADR-0005](../adr/0005-pin-rhwp-and-isolate-adapter.md)) | 의존 |
| `packages/hwp` | `hwp` | 양식 채움 변환, HWPX/HWP 저장, 자체 검증, Node 파일 변환(`/node`). 엔진은 주입 | 주입 |
| `packages/diagram` | `diagram` | Mermaid 렌더(Node, 격리). 이후 ERD 렌더 합류 | 모름 |
| `packages/author` | `author` | 양식 등록 단계의 LLM 연결(프로필 생성·검토, LangChain). **LLM 의존은 여기에만** | 모름 |
| `apps/cli` | `cli` | `node:util.parseArgs` 어댑터. 파일 I/O, 종료 코드, 보고서. 필수 의존에 LLM 라이브러리 없음 | — |
| `apps/mcp` | `mcp` | LLM 에이전트용 도구(stdio). 허용 폴더(`PathGuard`) 제한. 서버는 LLM을 부르지 않음 | — |
| `apps/web` | `web` | React + MUI. 브라우저 안에서 변환, `@rhwp/editor`로 표시. 브라우저용 WASM 초기화는 여기 | — |
| (계획) `packages/erd`, `packages/export` | | ERD PNG, Office 출력 — [ADR-0019](../adr/0019-multi-format-output.md), [I-11](../07-implementation/I-11-erd.md)·[I-12](../07-implementation/I-12-office-export.md) | 모름 |
| `tools/`, `kit/` | | 개발 도구(생성기, 한컴 확인 키트 생성기), 한컴에서 열어 볼 키트 산출물 | — |

**의존 방향은 단방향**이다([ADR-0020](../adr/0020-package-restructure.md)): `core`는 다른 패키지를 모르고, `engine-rhwp`·`hwp`·`diagram`은 `core`만 알며(`hwp`는 Node 변환에서 `diagram`도), `apps`가 조립한다. 경계는 시험이 지킨다(`engine-rhwp/test/boundaries.test.ts`).

스택: TypeScript 7, Node 24 LTS, pnpm 12 workspace, Biome, Vitest, Playwright, remark/unified, yaml, Ajv, Vite, React 19 + MUI 9. 버전은 정확히 고정([ADR-0013](../adr/0013-runtime-and-package-manager.md)). 프로필 저장·관리와 다중 사용자(서버)는 미결.

## 흐름

```
[등록, 양식당 1회] 양식 → 분석 → 프로필 초안(사람 또는 author의 LLM) → 점검·드라이런 → 사람 승인 → templates/<유형>/
[변환, 문서마다]  md → ① 읽기(프로필 규칙→데이터 트리) → ② 규약 검증(JSON Schema)
                    → ③ 프로필 점검(checkProfile → Plan) → ④ Mermaid 렌더(주입된 렌더러)
                    → ⑤ 실행(엔진 세션: 필드·셀·행·복제·삭제·그림, 배치 조판)
                    → ⑥ 저장(HWPX) → ⑦ 자체 검증(재로드 대조) → [⑧ HWP 5.0 저장·검증]
```
- ①②③은 엔진과 무관한 순수 함수, ⑤⑥⑧과 양식 분석만 엔진에 의존한다. 변환 경로에는 LLM이 없다([ADR-0007](../adr/0007-llm-by-host-agent-conversion-llm-free.md)).
- md 위반은 줄 번호와 함께 LLM에 되돌려 수정시킨다(자기 교정 루프는 호스트 에이전트 몫).
- 데이터 구조: [data-model.md](data-model.md)

## 출력 포맷 ([ADR-0019](../adr/0019-multi-format-output.md))
| 종류 | 포맷 | 방식 | 검증 |
|---|---|---|---|
| 기준 | HWPX | 양식 파일을 엔진으로 채움 | 재로드 대조(필드·표·행·그림·쪽 나눔·높이) |
| 엔진 파생 | HWP 5.0 | 같은 세션 `exportHwp()` | HWPX 재로드와 내용 비교(쪽 수는 알림) |
| 모델 파생(계획) | ERD PNG, DOCX·XLSX·PPTX | md 데이터 트리에서 생성 | 내용 충실도 |

## 환경 주입
| 항목 | Node(CLI/MCP) | 브라우저(웹) |
|---|---|---|
| WASM 로드 | `initSync` | `init` |
| 다이어그램 | mermaid-cli(격리: strict, 네트워크 차단) | 브라우저 mermaid |
| 파일 | `fs` | `File`/`fetch` |

환경 차이는 **엔진 팩토리와 렌더러 주입**으로 푼다([ADR-0011](../adr/0011-core-adapter-split-by-injection.md)): `createRhwpEngine(init)`(`engine-rhwp`), `convertBytes(engine, {…, renderDiagram?, formats?})`(`hwp`).

## 오류 원칙
- 프로필·md 문제는 **변환 전에** 코드·경로·줄·후보와 함께 막는다(점검=변환). 정책(`policy`)에 따라 경고로 낮출 수 있다.
- 변환 후 자체 검증 실패는 종료 코드 2. HWP 저장·검증 실패는 HWPX 산출물을 막지 않고 보고에 남긴다(검증을 통과하지 못한 HWP 파일은 쓰지 않음).
