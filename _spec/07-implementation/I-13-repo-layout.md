# I-13 패키지·폴더 재편

상태: **구현 완료**(S1~S4, 개발자 승인: "일단 정해진 것부터 처리"). 웹 기능 정리와 Docker 배포는 이 단계 밖(별도 계획). 결정: [ADR-0020](../adr/0020-package-restructure.md)(개발자 승인: 권장안 D1~D5). 선행: I-10. 후행: I-11, I-12(새 패키지가 처음부터 올바른 자리에 들어가도록 먼저 한다).

## 목표
동작을 바꾸지 않고 패키지와 폴더를 [ADR-0020](../adr/0020-package-restructure.md)의 구조로 옮긴다.

```
packages/ core · engine-rhwp · hwp · diagram · author     (I-11·I-12에서 erd · export 추가)
apps/     cli · mcp · web
tools/    개발 도구      kit/hancom/  확인 키트      templates/  문서 유형(현행)
```

## 이동표
| 지금 | 이후 |
|---|---|
| `core/src/markdown/`, `profile/`, `engine/types.ts`, `node/profile-file.ts` | `core` (`node/`는 `core/src/node`) |
| `core/src/engine/rhwp.ts`, `node/rhwp-node.ts` | `engine-rhwp` (`createRhwpEngine`, Node `rhwpEngine`·`createBlankDoc`·`ensureRhwp`) |
| `core/src/convert/*`, `node/convert-file.ts` | `hwp` (`convertBytes`, `previewMapping`, `testProfile`, `verify*`; `/node`의 `convert`) |
| `core/src/node/mermaid.ts` | `diagram` (`/node`: `renderMermaid`, `findChromium`, `safeFileName`) |
| `core/scripts/*`, `author/scripts/spike.ts` | `tools/`(생성기: 스키마·문서·양식·예제 프로필, 확인 키트). `p6-nofit.ts`·`stress.ts` 삭제, `make-template(s)` 합침 |
| `_spec/06-quality/hancom-kit/` | `kit/hancom/` (`_spec`에는 링크만) |
| `core/schema/profile.schema.json` | `core` 안에 유지 |
| `packages/{cli,mcp,web}` | `apps/{cli,mcp,web}` |
| `core/test/*` | 실제 엔진이 필요한 시험(`convertBytes` 등)은 `hwp/test`, 엔진 없이 되는 것은 `core/test`, 엔진 시험은 `engine-rhwp/test` |

## 작업 (각 단계 끝에 `pnpm check` 통과 후 커밋)
1. **S1 껍데기**: `apps/` 분리(`pnpm-workspace.yaml`, vitest `include`, CI·`package.json` 스크립트 경로), `tools/`·`kit/` 이동, 낡은 스크립트 삭제. 코드 변경 없음.
2. **S2 `engine-rhwp`**: `engine/rhwp.ts`·`rhwp-node.ts` 이동, `@rhwp/core` 의존을 여기로. `core`의 `index.ts`에서 `createRhwpEngine` 제거, 소비자 import 수정.
3. **S3 `hwp`**: `convert/`·`convert-file.ts` 이동, 시험 이전(위 표), `@yangsik/core` 사용처 수정. 공개 API 재배치.
4. **S4 `diagram`과 정리**: `mermaid.ts` 이동(`mermaid-cli` 의존도 이동), 문서·링크 갱신(`architecture.md`, `_spec/README.md`, `CLAUDE.md` 문서 지도, `engine-interface.md`, `registering-a-template.md`, 확인 키트 경로).

## 완료 기준
- `pnpm check`(타입·린트·포맷·시험)와 웹 e2e 통과, CI 통과. 시험 수는 같다(이동·분할만).
- HWPX 골든 시험과 확인 키트 `MANIFEST.json`의 SHA-256 불변.
- `core`와 `diagram`의 의존에 `@rhwp/core` 없음, `hwp`의 `dependencies`에 `@yangsik/engine-rhwp` 없음(시험으로 지킴: 패키지별 의존 목록 점검).
- 문서의 경로·링크에 깨진 것이 없다.

## 결정 사항 (권장안)
| # | 결정 | 근거 |
|---|---|---|
| D1 | 패키지 이름: `@yangsik/engine-rhwp`, `@yangsik/hwp`, `@yangsik/diagram` | 역할이 이름에 드러남 |
| D2 | 소스 TS 직접 실행(`exports`가 `src`)은 유지, 빌드·번들은 이번 범위 밖 | 배포 형태는 미결(로드맵) |
| D3 | 웹은 `engine-rhwp`의 브라우저 초기화를 쓰고 Node 모듈을 끌어오지 않는다 | `/node` 분리 유지 |
| D4 | 시험에서 `hwp`→`engine-rhwp`는 devDependency로만 허용 | 통합 시험에 실제 엔진 필요 |
| D5 | 단계마다 커밋하고 PR #6에 얹는다(병합은 승인 후) | 규칙 6 |

## S1 결과
- `apps/{cli,mcp,web}`로 이동(깊이가 같아 상대 경로 대부분 유지, MCP 시험의 `core/test/util` import만 수정). 워크스페이스·vitest `include`에 `apps/*` 추가.
- `tools/`를 워크스페이스 패키지(`@yangsik/tools`)로 만들고 생성기·확인 키트 생성기를 이동. 루트에서 `pnpm gen:schema|docs|templates|profiles`, `pnpm kit:hancom`, `pnpm author:spike`(tools). `core`·`author`의 해당 스크립트 항목 삭제. `make-template.ts`는 `make-templates.ts`에 합쳤다(경로를 인자로 주면 유스케이스 양식만 그 경로에 씀).
- `p6-nofit.ts`·`stress.ts` 삭제. `_spec/06-quality/hancom-kit/` → `kit/hancom/`.
- 확인: 시험 167개 그대로, 웹 e2e 4개, 확인 키트 SHA-256·쪽 수 동일, 생성기 재실행 시 양식·스키마·프로필 바이트 불변, `profile-reference.md`는 명령 안내 문구만 변경.
- 한계: 코어 시험(`profile.test`)이 `tools/profile-docs`를 import한다(S3에서 `hwp` 시험으로 옮길 때 다시 본다).

## S2 결과
- `packages/engine-rhwp` 신설: `rhwp.ts`(엔진 구현), `node.ts`(`rhwpEngine`·`ensureRhwp`·`createBlankDoc`). 엔트리 `@yangsik/engine-rhwp`(`createRhwpEngine`)와 `@yangsik/engine-rhwp/node`. `core`의 `createRhwpEngine`·`rhwpEngine` 등 공개 API는 제거(호환 별칭 없음), `core`는 `@rhwp/core` 의존을 버림.
- 브라우저 초기화(WASM 주소, `measureTextWidth`)는 웹 앱(`apps/web/src/browser.ts`)에 두고 `createRhwpEngine(init)`에 넘긴다. 번들러 전용(`?url`)이라 패키지로 옮기지 않았다(ADR-0020의 "Node/브라우저 초기화" 중 Node만 패키지에 있음).
- `core` 시험은 아직 엔진이 필요해 `../../engine-rhwp/src/node`를 상대 경로로 import한다(워크스페이스 순환 의존을 피하려고). S3에서 `hwp`로 옮기며 해소.
- 시험 +2 (`engine-rhwp/test/boundaries.test.ts`): `@rhwp/core` 의존은 `engine-rhwp`·웹뿐, `core` 소스는 `@rhwp/core`를 import하지 않음. 총 169개.
- 확인: `pnpm check`, 웹 e2e 4개, 키트 SHA-256·쪽 수 동일.

## S3 결과
- `packages/hwp` 신설: `convert/*`와 `node/convert-file`을 이동(`src/convert.ts`·`blocks`·`mapping`·`resolve`·`test-profile`·`values`·`verify`, `/node`는 `src/node.ts`). 공개 API: `convertBytes`, `previewMapping`, `testProfile`, `ProfileError`, `ValidationError`와 타입, `/node`의 `convert`, `hwpPathOf`. `hwp`의 `dependencies`는 `@yangsik/core`뿐이고 엔진은 주입받는다(`engine-rhwp`는 시험용 devDependency).
- `core`는 변환 API를 잃고, `hwp`가 쓰는 `closest`와 타입(`Format`, `Policy`, `ValueSpec`)을 내보낸다. 레지스트리·예제 상수는 시험·도구용 서브패스 `@yangsik/core/kinds`로 노출.
- 소비자(cli·mcp·web·author·tools)를 새 import로 수정. `author`는 `hwp`에 런타임 의존.
- 시험 이전: 엔진이 필요한 변환 시험 7개 파일과 `golden`·`util`은 `hwp/test`로, `profile.test`는 순수 부분(스키마·kind 목록·가이드·kind 등록)은 `core`에, 양식 점검·양식 분석은 `hwp/test/profile-check.test.ts`로 분할. `core` 시험은 더 이상 엔진을 import하지 않는다. S1·S2의 임시 상대 경로 import 해소. 시험 +2(`hwp/test/api.test.ts`, 경계 시험 1건 추가), 총 171개.
- 확인: `pnpm check`, 웹 e2e 4개, 키트 SHA-256·쪽 수 동일.

## S4 결과
- `packages/diagram` 신설: `mermaid.ts` → `src/node.ts`(`/node`: `renderMermaid`, `findChromium`, `safeFileName`). `@mermaid-js/mermaid-cli`는 `diagram`의 선택적 peer·devDependency로 이동(`core`에서 제거). `hwp`는 Node 변환에서 `diagram`을 쓰므로 `dependencies`는 `core`·`diagram`. Mermaid 파일 이름 시험은 `diagram/test`로 이동.
- 경계 시험 갱신: `core`·`diagram`은 다른 `@yangsik` 패키지에 의존하지 않음.
- 문서 갱신: `architecture.md`(패키지·의존 방향 표), `engine-interface.md`, `_spec/README.md`, 루트 `README.md`, 깨진 링크 1건(I-6 → `kit/hancom`) 수정. 최종 시험 171개.
- 확인(S1~S4 공통): `pnpm check`, 웹 e2e 4개, 확인 키트 SHA-256·쪽 수 동일, 생성기 재실행 시 산출물 불변.
