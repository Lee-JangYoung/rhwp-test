# ADR-0013: 런타임은 Node 24 LTS, 패키지 매니저는 pnpm 12, 버전은 고정한다

- 상태: 채택 (호환 시험: [S-24](../06-quality/verification-spike.md))
- 날짜: 2026-10-15

## 배경
2026-10-15 기준 Node 24(Krypton)는 LTS로 최신 24.22.0이다. Active LTS는 2026-10-20에 Maintenance LTS로 바뀌고 2028-04-30까지 지원된다. Node 26은 2026-10-28에 LTS가 되며 2029-04-30까지 지원된다(`nodejs/Release` `schedule.json`). 의존성의 `engines`는 모두 Node 24를 허용한다(vitest 5 `^22.12 || ^24 || >=26`, mermaid-cli 12 `>=22.13`, vite 8.3 `>=22.12`).

## 결정
- 런타임은 **Node 24 LTS**(`.nvmrc` 24, `engines.node >=24`). Node 26은 LTS 이후 같은 시험을 돌려 재검토한다.
- 패키지 매니저는 **pnpm 12.11.2**(`packageManager` 필드로 고정), 워크스페이스는 `pnpm-workspace.yaml`. 락파일(`pnpm-lock.yaml`)을 커밋한다. 빌드 스크립트 허용 목록(`esbuild`, `puppeteer`)을 명시하고 브라우저는 내려받지 않는다(`PUPPETEER_SKIP_DOWNLOAD=1`, 시스템 Chromium 사용).
- 의존성은 **정확한 버전으로 고정**하고, 갱신은 시점의 최신 안정 버전을 확인한 뒤 전체 시험 통과 시에만 한다. 암묵 의존성은 pnpm이 드러내므로 명시한다(예: `@types/mdast`).

## 대안
| 대안 | 장점 | 단점 |
|---|---|---|
| npm workspaces | 추가 설치 없음 | 숨은 의존성이 평평한 `node_modules`에 가려짐 |
| Node 22 유지 | 환경 기본 | 지원 종료가 가장 빠름(2027-04-30) |
| Node 26 | 지원 기간 최장 | 이 프로젝트 시험 전, LTS는 10-28부터 |

## 결과
- CI와 로컬이 같은 런타임·패키지 매니저를 쓴다(GitHub Actions에는 pnpm 설치 단계가 필요).
- Corepack으로 `packageManager` 버전이 자동 적용되는지는 확인하지 못했다 [검증 필요].
