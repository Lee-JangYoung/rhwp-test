# _spec — 프로젝트 구성과 설계

**목적**: AI가 만든 SI 산출물 Markdown(유스케이스·클래스·DB 명세서)을 **등록한 양식의 HWPX**로 변환한다. **Markdown이 원본**이고 산출물은 생성물이다. 변환 엔진은 [rhwp](https://github.com/edwardkim/rhwp)(`@rhwp/core` 0.8.7, Rust + WASM). **HWP 5.0**도 같은 세션에서 함께 낼 수 있다. ERD PNG·Office 출력은 계획([ADR-0019](adr/0019-multi-format-output.md)).

## 구성

```
packages/core    # @yangsik/core — md 읽기, 프로필 점검, 변환·자체 검증, 엔진 인터페이스(rhwp). Node/브라우저 공통, Node 전용은 @yangsik/core/node
packages/author  # @yangsik/author — 등록 단계 LLM 연결(프로필 생성·검토). LLM 의존은 여기에만
packages/cli     # @yangsik/cli — 명령줄(convert·validate·profile …)
packages/mcp     # @yangsik/mcp — LLM 에이전트용 MCP 서버(stdio, 허용 폴더 제한). 서버는 LLM을 부르지 않음
packages/web     # @yangsik/web — React + MUI 웹 UI (문서 유형 선택·변환·미리보기·프로필 점검)
templates/<유형>/ # 문서 유형 프로필: usecase · class-spec · db-spec · report (양식 template.hwpx + profile.yaml + schema.json + example.md)
```
런타임 Node 24 LTS, pnpm 12 워크스페이스([ADR-0013](adr/0013-runtime-and-package-manager.md)).

```
[변환] AI가 example.md대로 md 작성 → 규약 검증 → 변환 → 검증 → HWPX (+ HWP)
        ▲                        │ 위반 메시지(자기 교정)
        └────────────────────────┘
```

핵심 결정(상세: [adr/](adr/)): 코어 + CLI/MCP/웹 어댑터 · 양식 등록형 문서 유형 프로필 · LLM은 호스트 에이전트가 담당하고 변환에는 쓰지 않음 · 코어는 환경 독립 · Mermaid는 이미지 삽입 · **엔진 인터페이스로 라이브러리 교체 가능** · rhwp 0.8.7 고정 · **기준 출력 HWPX, HWP 5.0은 같은 세션에서 파생**.

## 현재 상태 (실제)

| 항목 | 상태 |
|---|---|
| 구현 | 계획된 단계(I-0~I-9, I-A) 완료 + HWP 5.0 출력(I-10). 시험 167개·CI 통과. `impl/core`의 변경은 단계마다 PR로 `main`에 병합 |
| 확인됨 (합성 양식, rhwp 내) | 누름틀·표 복제·행 목록·중첩·삭제·토큰·문단 채움, Mermaid 그림, 저장 후 자체 검증, HWP 5.0 왕복(내용 일치), CLI·MCP·웹 동작, 대형 문서 1 s대 → [verification-spike.md](06-quality/verification-spike.md) |
| 미검증 | **한컴 열림(S-23, HWPX·HWP 모두)**, 실제 SI 양식, 실제 LLM 호출(S-26), 스타일 적용, 머리말·쪽번호 보존, 폭 계산·쪽수 정확도(S-11), HWP 쪽 수 차이(L-23) |
| 막힌 것 | 실제 양식 샘플(HWPX), 한컴 확인 환경 |
| 미결 | "한컴과 거의 동일"의 기준, 배포 형태, 서버 정책 → [roadmap.md](roadmap.md) |

## 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 왜, 어디까지 | [01-overview/vision.md](01-overview/vision.md) |
| 구성, 데이터 흐름, 환경 차이 | [02-architecture/architecture.md](02-architecture/architecture.md) |
| 내부 데이터 구조(md 데이터 트리·Plan) | [02-architecture/data-model.md](02-architecture/data-model.md) |
| 엔진 인터페이스(라이브러리 교체) | [02-architecture/engine-interface.md](02-architecture/engine-interface.md) |
| rhwp 버전·동작·제약·쓸 API | [03-rhwp-reference/](03-rhwp-reference/) |
| 양식 프로필(md 읽기 규칙·바인딩), 프로그램 vs LLM 분담 | [04-conversion/doctype-profile.md](04-conversion/doctype-profile.md), 키 전체 [profile-reference.md](04-conversion/profile-reference.md) |
| 양식 등록 절차 | [04-conversion/registering-a-template.md](04-conversion/registering-a-template.md) |
| Mermaid 처리 | [04-conversion/mermaid.md](04-conversion/mermaid.md) |
| CLI / MCP / 웹 UI | [05-interfaces/](05-interfaces/) |
| 검증 상태 (단일 출처) | [06-quality/verification-spike.md](06-quality/verification-spike.md) |
| 단계 계획, 후순위 메모, 미결 사항 | [roadmap.md](roadmap.md) |
| 구현 단계별 계획·결정 사항 | [07-implementation/](07-implementation/) |
| 기능 평가와 재설계 | [08-evaluation/evaluation-2026-10.md](08-evaluation/evaluation-2026-10.md) |

## 작성 규칙
- 한국어로 쓰고 코드·식별자는 영어 그대로 둔다.
- 검증하지 않은 내용은 **`[검증 필요]`** 로 표시하고 `verification-spike.md`의 ID(S-xx, R-xx)를 단다.
- rhwp API는 `rhwp.d.ts`(0.8.7)에서 확인된 이름만 적는다.
- 결정은 `adr/`에 기록하고, 바꿀 때는 기존 ADR을 고치지 않고 새 ADR로 대체한다.
