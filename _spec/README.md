# _spec — 프로젝트 구성과 설계

**목적**: AI가 만든 SI 산출물 Markdown(유스케이스·클래스·DB 명세서)을 **등록한 양식**의 HWP/HWPX로 변환한다. 변환 엔진은 [rhwp](https://github.com/edwardkim/rhwp)(`@rhwp/core` 0.8.7, Rust + WASM).

## 구성 (계획)

```
packages/core    # 양식 분석, 프로필, md → IR → rhwp 어댑터. Node/브라우저 공통
packages/cli     # md2hwp (1순위)
packages/mcp     # LLM 에이전트용 MCP 서버 (2순위)
packages/web     # Vite 웹 UI (3순위)
templates/<유형>/ # 문서 유형 프로필: 양식 + template.md + schema.json + profile.yaml + prompt.md
examples/        # 샘플 md
spike/           # rhwp 동작 검증 스크립트
```

```
[등록] 샘플 양식 → 분석(프로그램) → 해석(LLM) → 사람 승인 → 프로필
[변환] AI가 template.md대로 md 작성 → 규약 검증 → 변환 → 검증 → HWP/HWPX
```

핵심 결정(상세: [adr/](adr/)): 코어 + CLI/MCP/웹 어댑터 · 양식 등록형 문서 유형 프로필 · LLM은 호스트 에이전트가 담당하고 변환에는 쓰지 않음 · 코어는 환경 독립 · Mermaid는 이미지 삽입 · rhwp 0.8.7 고정 + 어댑터 격리.

## 현재 상태 (실제)

| 항목 | 상태 |
|---|---|
| 저장소 내용 | `_spec/` 문서만 있음. **코드 없음** |
| 위 "구성" | 모두 계획. `packages/` 등 아직 미생성 |
| 검증됨 | `createEmpty()` → 삽입 → HWP 저장 → 재로드(S-00), 빈 문서의 표 구조 조회 API 동작(R-01 일부) |
| 미검증 | 양식 로드·스타일 적용·표/이미지/목록/각주·HWPX 저장·쪽수 정확도·반복 블록 처리 → [verification-spike.md](06-quality/verification-spike.md) |
| 막힌 것 | 지정 양식 파일 없음, 원격에 PR base 브랜치 없음 |
| 미결 | 프로필 저장·관리 방식, 다중 사용자(서버) 제공 방식, "한컴과 거의 동일"의 기준, 주로 쓸 MCP 클라이언트 |

## 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 왜, 어디까지 | [01-overview/vision.md](01-overview/vision.md) |
| 구성, 두 흐름, 환경 차이 | [02-architecture/architecture.md](02-architecture/architecture.md) |
| 내부 데이터 구조(IR) | [02-architecture/ir-spec.md](02-architecture/ir-spec.md) |
| rhwp 호출 경계 | [02-architecture/rhwp-adapter.md](02-architecture/rhwp-adapter.md) |
| rhwp 버전·동작·제약·쓸 API | [03-rhwp-reference/](03-rhwp-reference/) |
| md 요소 → HWP 매핑 | [04-conversion/md-element-mapping.md](04-conversion/md-element-mapping.md) |
| 양식 등록, 프로필, 프로그램 vs LLM 분담 | [04-conversion/doctype-profile.md](04-conversion/doctype-profile.md) |
| Mermaid 처리 | [04-conversion/mermaid.md](04-conversion/mermaid.md) |
| CLI / MCP / 웹 UI | [05-interfaces/](05-interfaces/) |
| 검증 상태 (단일 출처) | [06-quality/verification-spike.md](06-quality/verification-spike.md) |
| 단계 계획 | [roadmap.md](roadmap.md) |

## 작성 규칙
- 한국어로 쓰고 코드·식별자는 영어 그대로 둔다.
- 검증하지 않은 내용은 **`[검증 필요]`** 로 표시하고 `verification-spike.md`의 ID(S-xx, R-xx)를 단다.
- rhwp API는 `rhwp.d.ts`(0.8.7)에서 확인된 이름만 적는다.
- 결정은 `adr/`에 기록하고, 바꿀 때는 기존 ADR을 고치지 않고 새 ADR로 대체한다.
