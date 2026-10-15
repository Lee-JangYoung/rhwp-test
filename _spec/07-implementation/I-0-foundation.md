# I-0 기반 (저장소·도구)

상태: **승인됨(2026-10-15)**, 구현 중. 결정 사항 D1~D5는 아래와 같이 확정됐다. 단계 표: [roadmap.md](../roadmap.md) "2단계 준비".

## 목표
코드 이동 없이 **빈 패키지와 도구 체계**만 만들어, 이후 단계(I-1~)가 같은 규칙으로 쌓이게 한다. 완료 후 깨끗한 환경에서 설치 → 타입체크 → 린트 → 시험이 통과한다.

## 범위
| 포함 | 제외 (다음 단계) |
|---|---|
| pnpm 워크스페이스, Node 24, 도구 설정, `packages/core`·`packages/cli` 빈 뼈대, 스모크 시험 1개씩, CI | PoC 코드 이식(I-1), 프로필(I-2), `packages/mcp`·`web`(I-7·I-8) |

## 작업
1. **루트**: `package.json`(`private`, `packageManager: pnpm@12.11.2`, `engines.node >=24`), `pnpm-workspace.yaml`(`packages/*`, 의존성 `catalog:`로 정확 버전 고정, 빌드 스크립트 허용 목록 `esbuild`·`puppeteer`), `.nvmrc`(24), `.npmrc`(`PUPPETEER_SKIP_DOWNLOAD`는 설치 환경에서 설정), `tsconfig.base.json`(strict, ESM, Bundler 해석), `.gitignore` 보강.
2. **패키지 뼈대**: `packages/core`, `packages/cli` — `package.json`, `tsconfig.json`, `src/index.ts`(자리표시), `test/smoke.test.ts` 1개. `cli`는 `core`를 `workspace:*`로 참조.
3. **스크립트(루트)**: `typecheck`, `lint`, `format`, `test`(vitest, **`poc/web/e2e` 제외**), `build`.
4. **도구 설정**: 린트·포맷 설정 파일(D1), vitest 설정.
5. **CI**(D2): PR마다 설치(`--frozen-lockfile`) → typecheck → lint → test.
6. **암묵 의존성 정리**: `@types/mdast` 등 pnpm이 드러낸 누락을 명시([S-24](../06-quality/verification-spike.md)).
7. **문서**: 결정 결과를 ADR-0015로 기록, README의 구성 표 갱신, `LICENSE`(MIT) 추가.

## 완료 기준
- 깨끗한 클론에서 `pnpm install --frozen-lockfile` → `pnpm typecheck && pnpm lint && pnpm test` 통과 (Node 24).
- 락파일 커밋, 의존성은 모두 정확한 버전.
- PoC(`poc/`)는 변경하지 않으며 기존 시험이 그대로 통과.

## 결정 사항 (확정)

| # | 결정 | 확정 | 근거 |
|---|---|---|---|
| D1 | 린트·포맷 | **Biome 2.5.15** | typescript-eslint 8.71.2의 peer `typescript`가 `<6.1.0`이라 TypeScript 7.0.2와 맞지 않음(`npm view`). Biome는 PoC 소스에 실행해 동작 확인(기본 규칙에서 오류 11·경고 9, 규칙 조정 필요). 단점: 타입 정보 기반 규칙 없음 |
| D2 | CI | **GitHub Actions** | 단계마다 PR 검토하는 흐름에 자동 검증 필요. 공개 저장소의 비용은 확인하지 못함 [검증 필요] |
| D3 | 제품·패키지 이름 | **`yangsik`** → `@yangsik/core`, `@yangsik/cli` (미배포) | `md2hwpx`는 GitHub에 같은 이름 저장소가 다수(6건 이상), `sidoc`은 56건. `yangsik`은 npm 미사용(404), GitHub `yangsik hwpx` 검색 0건. npm 스코프 `@yangsik` 사용 가능 여부는 미확인 |
| D4 | 라이선스 | **MIT** | 사용자 결정. 저작권 표기는 저장소 소유자(`Lee-JangYoung`)로 적음. 패키지는 배포 결정 전까지 `private: true`. 웹 번들에 rhwp(MIT)·mermaid(MIT) 등을 포함해 배포할 때의 고지 방식은 웹 단계에서 확인 [검증 필요] |
| D5 | `poc/` | **I-1 이식이 끝날 때까지 유지, 이후 삭제** | 이식 중 동작 비교 기준, 결과 기록은 `_spec`에 있음 |

## 위험
- pnpm 12는 빌드 스크립트 허용 설정 없이 설치가 중단된다(S-24). 설정으로 해결하며, CI에서 같은 조건으로 검증한다.
- Biome 기본 규칙이 PoC 스타일과 다르다. 이식 전까지는 `poc/`를 린트 대상에서 제외한다.
