# yangsik

AI가 Markdown으로 쓴 SI 산출물(유스케이스·클래스·DB 명세서)을 **지정한 양식의 HWPX**로 변환한다. Markdown이 원본이고 산출물은 생성물이다. 엔진은 [rhwp](https://github.com/edwardkim/rhwp)(`@rhwp/core` 0.8.7).

설계·결정·검증 상태는 [`_spec/`](_spec/README.md)에 있다. 구현은 단계별로 진행한다([`_spec/roadmap.md`](_spec/roadmap.md)).

## 시작하기

Node 24 LTS, pnpm 12.11.2(`packageManager` 필드)가 필요하다.

```bash
pnpm install
pnpm check                       # typecheck + lint + format + test
pnpm yangsik doctor
pnpm yangsik convert templates/usecase/example.md -p templates/usecase/profile.yaml -o out/usecase.hwpx
pnpm --filter @yangsik/web dev   # 웹 PoC (http://127.0.0.1:5173)
pnpm --filter @yangsik/web test:e2e
```

- Mermaid 렌더는 시스템 Chromium이 필요하다(`PUPPETEER_EXECUTABLE_PATH`, 없으면 Mermaid 시험은 건너뜀). 브라우저는 내려받지 않는다.
- 외부 양식 샘플은 저장소에 넣지 않는다(저작권 불명확). 로컬 경로로만 지정한다.

## 구성

| 경로 | 내용 |
|---|---|
| `packages/core` | `@yangsik/core` — md 읽기·프로필 점검·데이터 트리·엔진 인터페이스(환경 독립, rhwp를 모름). Node 전용은 `@yangsik/core/node` |
| `packages/engine-rhwp` | `@yangsik/engine-rhwp` — rhwp(`@rhwp/core` 고정) 엔진 구현, Node 로더 |
| `packages/hwp` | `@yangsik/hwp` — 양식 채움 변환(HWPX)·HWP 5.0 저장·자체 검증. 엔진은 주입 |
| `packages/diagram` | `@yangsik/diagram` — Mermaid 렌더(Node, 격리) |
| `packages/author` | `@yangsik/author` — 양식 등록 단계의 LLM 연결(프로필 생성·검토), LangChain 기반 |
| `apps/cli` | `@yangsik/cli` — 명령줄 |
| `apps/mcp` | `@yangsik/mcp` — MCP 서버(stdio): 프로필 작성·검증·변환 도구 12개 |
| `apps/web` | `@yangsik/web` — React + MUI 웹 UI(`@rhwp/editor` 임베드, 변환은 브라우저 안) |
| `templates/` | 문서 유형 폴더(프로필·합성 양식·규약·예제): usecase, class-spec, db-spec, report |
| `tools/` | 개발 도구: 스키마·문서·양식·예제 프로필 생성기, 한컴 확인 키트 생성기 (`pnpm gen:*`, `pnpm kit:hancom`) |
| `kit/hancom/` | 한컴에서 열어 볼 확인 키트 산출물([README](kit/hancom/README.md)) |

## 라이선스
MIT
