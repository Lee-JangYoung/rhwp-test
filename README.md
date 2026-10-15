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
| `packages/core` | `@yangsik/core` — 환경 독립 변환 코어. Node 전용은 `@yangsik/core/node` |
| `packages/author` | `@yangsik/author` — 양식 등록 단계의 LLM 연결(프로필 생성·검토), LangChain 기반 |
| `templates/` | 문서 유형 폴더(프로필·합성 양식·규약·예제): usecase, class-spec, db-spec, report |
| `packages/mcp` | `@yangsik/mcp` — MCP 서버(stdio): 프로필 작성·검증·변환 도구 12개 |
| `packages/cli` | `@yangsik/cli` — 명령줄 |
| `packages/web` | `@yangsik/web` — React + MUI 웹 UI(`@rhwp/editor` 임베드, 변환은 브라우저 안) |
| `templates/usecase` | 첫 문서 유형 자료(스키마·합성 양식·예제 md) |

## 라이선스
MIT
