# ADR-0015: 린트·포맷은 Biome, CI는 GitHub Actions, 라이선스는 MIT, 이름은 yangsik

- 상태: 채택 (I-0 단계, [I-0-foundation.md](../07-implementation/I-0-foundation.md))
- 날짜: 2026-10-15

## 결정
- 린트·포맷: **Biome 2.5.15**. typescript-eslint 8.71.2의 peer `typescript`가 `<6.1.0`이라 TypeScript 7.0.2와 맞지 않는다(`npm view`). 타입 정보 기반 규칙은 쓰지 못한다.
- CI: **GitHub Actions**. PR마다 설치(`--frozen-lockfile`) → typecheck → lint → format → test.
- 라이선스: **MIT**(저작권 표기 `Lee-JangYoung`). 패키지는 배포 결정 전까지 `private: true`.
- 이름: **yangsik**(`@yangsik/core`, `@yangsik/cli`). `md2hwpx`는 GitHub에 같은 이름 저장소가 다수, `sidoc`은 56건이라 피했다. `@yangsik` npm 스코프 사용 가능 여부는 미확인.

## 대안
| 대안 | 단점 |
|---|---|
| ESLint + typescript-eslint + Prettier | TypeScript 7과 peer 불일치, 도구 3개 |
| `md2hwpx` | 이름 충돌·혼동 |

## 결과
- 린트 규칙은 `preset: "recommended"`로 시작하고, I-1 이식 때 조정한다.
- 웹 번들에 rhwp·mermaid 등 MIT 의존성을 포함해 배포할 때의 고지 방식은 웹 단계에서 정한다 [검증 필요].
