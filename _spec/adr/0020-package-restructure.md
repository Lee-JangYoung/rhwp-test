# ADR-0020: 패키지를 역할별로 재편한다 (core / engine-rhwp / hwp / diagram + apps)

- 상태: 채택 (개발자 승인 2026-10-15, 권장안 D1~D5). [ADR-0001](0001-monorepo-core-cli-web.md)·[0008](0008-core-with-cli-mcp-web-adapters.md)·[0011](0011-core-adapter-split-by-injection.md)의 **패키지 구분을 대체**한다(코어/어댑터 분리와 주입 원칙은 유지). [ADR-0005](0005-pin-rhwp-and-isolate-adapter.md)의 rhwp 격리를 패키지 경계로 강화한다.
- 날짜: 2026-10-15

## 배경
출력 포맷을 늘리는 중이다([ADR-0019](0019-multi-format-output.md)). `@yangsik/core`가 md 읽기·프로필·HWPX 채움 변환·rhwp 구현·Node 파일 변환·Mermaid 렌더를 모두 가져, 새 포맷(ERD, Office)이 들어갈 자리가 없고 이름과 내용이 어긋난다. 조사(import 관계)로 경계가 이미 코드에 있음을 확인했다: `markdown/`·`profile/`은 rhwp를 모르고, `convert/`는 엔진 인터페이스만 쓰며, `@rhwp/core`는 `engine/rhwp.ts` 한 곳에서만 import된다.

## 결정
1. **라이브러리(`packages/`)와 진입점(`apps/`)을 나눈다.**
2. 라이브러리는 역할별로 쪼갠다.

| 패키지 | 책임 | rhwp |
|---|---|---|
| `core` | md 읽기, 프로필 형식·점검·가이드, 데이터 트리, 엔진 인터페이스(타입), 프로필 파일 읽기(`/node`) | 모름 |
| `engine-rhwp` | rhwp 엔진 구현, Node/브라우저 초기화. `@rhwp/core`를 여기서만 의존·고정 | 의존 |
| `hwp` | 양식 채움 변환, HWPX/HWP 저장, 자체 검증, 파일 변환(`/node`) | 엔진 주입(직접 import 없음) |
| `diagram` | Mermaid 렌더(Node, 격리). 이후 ERD 렌더 합류 | 모름 |
| `erd`, `export` | I-11, I-12에서 신설 | 모름 |
| `author` | LLM 프로필 생성·검토(현행) | 모름 |

3. 진입점은 `apps/cli`, `apps/mcp`, `apps/web`.
4. 의존은 단방향이다: `core`는 아무것도 모르고, `engine-rhwp`·`hwp`·`diagram`·`erd`·`export`는 `core`만 알며, `apps`가 조립한다. `hwp`는 `engine-rhwp`에 의존하지 않는다(시험의 devDependency만 예외).
5. 공개 API는 **호환 별칭 없이** 바꾼다(0.x, 외부 사용자 없음).
6. 개발 도구는 루트 `tools/`, 사람이 열어 볼 산출물은 루트 `kit/`으로 옮긴다. 낡은 스크립트(`p6-nofit`, `stress`)는 지운다.

## 대안
| 대안 | 단점 |
|---|---|
| 지금 구조 유지 + 폴더만 정리 | `core`의 이름·책임 불일치와 rhwp 결합이 남고 새 포맷 패키지가 `core`에 기대게 됨 |
| `core` + `format-hwpx`만 분리 | rhwp 구현과 변환이 한 패키지에 남아 엔진 교체 시 변환까지 건드림, Mermaid 렌더가 `core`에 남음 |

## 결과
- 이동만 하고 동작은 바꾸지 않는다. 시험 167개, HWPX 골든·확인 키트 SHA-256 불변, 웹 e2e, CI 통과로 확인한다.
- 계획·단계·완료 기준: [I-13](../07-implementation/I-13-repo-layout.md).
