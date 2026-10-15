# I-1 코어 이식

상태: **승인됨(2026-10-15)**, 구현 중. 결정 D1~D6은 아래와 같이 확정됐다. I-0은 PR #2로 `main`에 병합됐다([I-0-foundation.md](I-0-foundation.md)). 단계 표: [roadmap.md](../roadmap.md).

## 목표
PoC(`poc/src`)의 변환 코어를 `packages/core`로 옮기고 Node 전용 코드를 분리한다. **동작은 바꾸지 않는다**(하드코딩 제거와 프로필은 I-2·I-3). 이동 후에도 같은 입력에서 같은 결과가 나와야 한다.

## 이식 대상 (PoC 1,785줄 중 `src` 약 970줄)

| PoC | 이식 위치 | 환경 |
|---|---|---|
| `engine/types.ts`, `engine/rhwp.ts`(`createRhwpEngine`) | `core/src/engine/` | 중립 |
| `core.ts`(`convertBytes`, `blockValues`, `ValidationError`) | `core/src/convert.ts` | 중립 |
| `parse.ts`, `validate.ts`, `blocks.ts`, `verify.ts` | `core/src/` | 중립 |
| `engine/rhwp-node.ts`(WASM `initSync`), `convert.ts`(파일 입출력 래퍼), `mermaid.ts`(mermaid-cli) | `core/src/node/` (D1) | Node 전용 |
| `cli.ts` | `cli/src/` (동작 그대로, 명령 재설계는 I-4) | Node |
| `schemas/usecase.schema.json`, `fixtures/`(md 4개·합성 양식) | `templates/usecase/` (D3) | — |
| `scripts/make-template.ts`, `stress.ts`, `p6-nofit.ts` | `core/scripts/` | Node |
| `test/convert.test.ts`(10개) | `core/test/` | Node |
| `web/`(React 앱, Playwright W1~W8) | D4 | 브라우저 |

## 작업
1. 파일 이동과 import 경로 정리. `core`의 환경 중립 모듈은 `node:*`·`Buffer`·`process`를 쓰지 않는다.
2. **환경 독립 검사 시험 추가**: `core/src`에서 `node/` 밖 파일이 `node:` 모듈을 가져오지 않는지 확인하는 시험.
3. 의존성 이전(정확한 버전 유지): core는 `@rhwp/core 0.8.7`, `ajv`, `remark-*`, `unified`, `yaml`, Node 전용은 `@mermaid-js/mermaid-cli`. `@types/mdast` 명시(S-24). pnpm 빌드 스크립트 허용 목록(`esbuild`, `puppeteer`) 추가, `PUPPETEER_SKIP_DOWNLOAD`.
4. PoC 시험 10개 이식(Chromium이 없으면 Mermaid 시험은 건너뜀, 기존과 동일).
5. 린트 규칙 조정: 이식 코드에서 나오는 Biome 지적을 정리한다(동작 변경 없는 수정만).
6. 이식 확인: **PoC와 이식본의 출력 비교**(D6).
7. 문서: 이식 결과를 이 문서에 기록, README 구성 표 갱신, ADR 필요 시 추가.

## 완료 기준
- `pnpm check`(typecheck·lint·format·test) 통과, CI 통과.
- PoC의 시험 10개와 같은 기대값이 `packages/core`에서 통과.
- 같은 입력(`usecase-ok`, `usecase-long`)으로 PoC와 이식본을 돌려 **변환 보고(항목·셀 수·쪽수·자체 검증 결과)가 같고 HWPX 본문 XML이 같음**.
- `node/` 밖의 코어 파일에 Node API 없음(시험으로 보장).
- `poc/`의 처리는 D4 결정대로.

## 결정 사항 (확정)

| # | 결정 | 확정 |
|---|---|---|
| D1 | Node 전용 코드의 위치 | `@yangsik/core`의 `node/` 폴더(하위 경로 `@yangsik/core/node`). 코어는 기능별 폴더(`engine/`, `markdown/`, `convert/`, `node/`)로 구분한다. Mermaid CLI(`@mermaid-js/mermaid-cli`)는 core의 선택적 peer 의존성으로 두어 브라우저 소비자(web)에 설치되지 않게 하고, cli가 의존한다 |
| D2 | 공개 API | 최소 범위(권장안). `convertBytes`, 입출력 타입, `ValidationError`, `createRhwpEngine`, 엔진 인터페이스, `parseMarkdown`, `validate`. 웹 PoC가 쓰던 매핑 미리보기(`previewMapping`)는 `web`에 두지 않고 core로 옮겨 함께 공개한다(동작 동일, 코드 이동) |
| D3 | 샘플 자료 위치 | 루트 `templates/usecase/`(`schema.json`, `template.hwpx`, `example.md`, `fixtures/`) |
| D4 | `poc/` 처리 | **전체 이전 후 삭제**: 코어·CLI·시험·스크립트는 `packages/core`·`cli`로, 웹 PoC는 `packages/web`으로(import를 `@yangsik/core`로 변경, Playwright W1~W8 유지) 옮긴 뒤 `poc/`를 삭제한다. 삭제 전 태그 `poc-final`을 남긴다 |
| D5 | 빌드 | I-1에서는 빌드 없이 TS 소스 노출, CLI는 `tsx` 실행. 빌드는 I-4 |
| D6 | 출력 비교 | 일회성 스크립트로 PoC와 이식본을 비교하고 결과만 기록 |

## 위험
- pnpm 12는 빌드 스크립트 허용 설정이 없으면 설치가 중단된다(S-24): 작업 3에서 처리.
- Biome 기본 규칙이 PoC 스타일과 다르다: 작업 5에서 동작 변경 없는 수정만 한다.
- CI에는 Chromium이 필요한 Mermaid 시험이 있다: 기본은 건너뛰고, CI에서 실행할지는 I-1에서 시도해 결과를 기록한다 [검증 필요].
