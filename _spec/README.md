# _spec — 프로젝트 구성과 설계

**목적**: AI가 만든 SI 산출물 Markdown(유스케이스·클래스·DB 명세서)을 **등록한 양식의 HWPX**로 변환한다. **Markdown이 원본**이고 산출물은 생성물이다. 변환 엔진은 [rhwp](https://github.com/edwardkim/rhwp)(`@rhwp/core` 0.8.7, Rust + WASM). HWP 5.0·Excel 출력은 후순위.

## 구성

```
packages/core    # @yangsik/core — 양식 분석, 변환, md → IR, 엔진 인터페이스. Node/브라우저 공통, Node 전용은 @yangsik/core/node
packages/cli     # @yangsik/cli — 명령줄 (명령 재설계는 I-4)
packages/web     # @yangsik/web — React 웹 PoC (I-8에서 MUI로 재구성)
packages/mcp     # (계획) LLM 에이전트용 MCP 서버
templates/usecase # 첫 문서 유형 자료(스키마·합성 양식·예제 md). 프로필(`profile.yaml`)과 함께 I-3에서 프로필 기반 변환의 기준 자료로 쓴다
templates/<유형>/ # (계획) 문서 유형 프로필: 양식(HWPX) + template.md + schema.json + profile.yaml + prompt.md
```
런타임 Node 24 LTS, pnpm 12 워크스페이스([ADR-0013](adr/0013-runtime-and-package-manager.md)).

```
[변환] AI가 template.md대로 md 작성 → 규약 검증 → 변환 → 검증 → HWPX
        ▲                        │ 위반 메시지(자기 교정)
        └────────────────────────┘
```

핵심 결정(상세: [adr/](adr/)): 코어 + CLI/MCP/웹 어댑터 · 양식 등록형 문서 유형 프로필 · LLM은 호스트 에이전트가 담당하고 변환에는 쓰지 않음 · 코어는 환경 독립 · Mermaid는 이미지 삽입 · **엔진 인터페이스로 라이브러리 교체 가능** · rhwp 0.8.7 고정 · **1차 출력 HWPX**.

## 현재 상태 (실제)

| 항목 | 상태 |
|---|---|
| 저장소 내용 | `_spec/`, `CLAUDE.md`, `packages/`(core·cli·web, I-1 이식 완료, 하드코딩은 아직 있음), `templates/usecase`. PoC 원본은 보관 브랜치 `archive/poc-final` |
| 확인됨 (합성 양식, rhwp 내) | 누름틀 채움, 표 복제 + 복제본별 셀 채움, Mermaid 그림 삽입, 저장 후 자체 검증, 브라우저 동작, 에디터 임베드, 조판 보정(그림·표 높이·쪽 나눔) → [verification-spike.md](06-quality/verification-spike.md) |
| 미검증 | **한컴 열림(S-23)**, 실제 SI 양식, 스타일 적용, 머리말·쪽번호 보존, 폭 계산·쪽수 정확도(S-11) |
| 막힌 것 | 실제 양식 샘플(HWPX) 없음, 한컴 확인 환경 없음, 원격에 PR base 브랜치 없음 |
| 미결 | "한컴과 거의 동일"의 기준, MCP 우선순위, md 원본 정책, 서버 정책 → [roadmap.md](roadmap.md) |

## 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 왜, 어디까지 | [01-overview/vision.md](01-overview/vision.md) |
| 구성, 데이터 흐름, 환경 차이 | [02-architecture/architecture.md](02-architecture/architecture.md) |
| 내부 데이터 구조(IR) | [02-architecture/ir-spec.md](02-architecture/ir-spec.md) |
| 엔진 인터페이스(라이브러리 교체) | [02-architecture/engine-interface.md](02-architecture/engine-interface.md) |
| rhwp 버전·동작·제약·쓸 API | [03-rhwp-reference/](03-rhwp-reference/) |
| md 요소 → HWPX 매핑 | [04-conversion/md-element-mapping.md](04-conversion/md-element-mapping.md) |
| 양식 프로필, 프로그램 vs LLM 분담 | [04-conversion/doctype-profile.md](04-conversion/doctype-profile.md) |
| Mermaid 처리 | [04-conversion/mermaid.md](04-conversion/mermaid.md) |
| CLI / MCP / 웹 UI | [05-interfaces/](05-interfaces/) |
| 검증 상태 (단일 출처) | [06-quality/verification-spike.md](06-quality/verification-spike.md) |
| 단계 계획, 후순위 메모, 미결 사항 | [roadmap.md](roadmap.md) |
| 구현 단계별 계획·결정 사항 | [07-implementation/](07-implementation/) |

## 작성 규칙
- 한국어로 쓰고 코드·식별자는 영어 그대로 둔다.
- 검증하지 않은 내용은 **`[검증 필요]`** 로 표시하고 `verification-spike.md`의 ID(S-xx, R-xx)를 단다.
- rhwp API는 `rhwp.d.ts`(0.8.7)에서 확인된 이름만 적는다.
- 결정은 `adr/`에 기록하고, 바꿀 때는 기존 ADR을 고치지 않고 새 ADR로 대체한다.
