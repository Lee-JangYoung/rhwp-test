# _spec — 설계 문서

rhwp(`@rhwp/core` 0.8.7)를 사용해 **Markdown을 지정 양식의 HWP/HWPX 산출물로 변환**하는 프로젝트의 설계 문서입니다.

## 폴더 구조

```
_spec/
├── README.md                     # 이 문서: 색인, 상태, 작성 규칙
├── 01-overview/                  # 무엇을, 왜
│   ├── vision.md                 #   목적, 범위, 비목표
│   ├── requirements.md           #   기능/비기능 요구사항 (ID 부여)
│   └── glossary.md               #   용어집
├── 02-architecture/              # 어떻게 나눌 것인가
│   ├── architecture.md           #   패키지 구조, 데이터 흐름
│   ├── ir-spec.md                #   중간표현(IR) 정의
│   └── rhwp-adapter.md           #   rhwp 호출 경계 (격리 계층)
├── 03-rhwp-reference/            # 사용하는 외부 라이브러리 정리
│   ├── overview.md               #   버전, 패키지, 실행 환경
│   ├── core-api.md               #   본 프로젝트가 쓰는 API 부분집합
│   └── known-limitations.md      #   제약, 위험, 검증 필요 항목
├── 04-conversion/                # 변환 규칙 (핵심 도메인)
│   ├── md-element-mapping.md     #   Markdown 요소 → HWP 요소 매핑
│   ├── style-map-spec.md         #   style-map.yaml 스키마
│   ├── template-guide.md         #   양식(템플릿) 제작 규칙
│   └── mermaid.md                #   다이어그램 처리
├── 05-interfaces/                # 사용자 접점
│   ├── cli.md                    #   md2hwp CLI
│   └── web-ui.md                 #   웹 UI
├── 06-quality/                   # 품질 보증
│   ├── test-strategy.md          #   테스트 전략
│   └── verification-spike.md     #   위험 검증 스파이크 계획
├── adr/                          # 설계 결정 기록 (Architecture Decision Records)
│   ├── 0000-template.md
│   ├── 0001-monorepo-core-cli-web.md
│   ├── 0002-template-file-based-styling.md
│   ├── 0003-environment-agnostic-core.md
│   ├── 0004-mermaid-prerender-to-image.md
│   └── 0005-pin-rhwp-and-isolate-adapter.md
└── roadmap.md                    # 단계별 계획과 상태
```

### 구성 원칙

| 원칙 | 설명 |
|---|---|
| 번호 접두사 | 읽는 순서(개요 → 구조 → 외부 의존 → 규칙 → 접점 → 품질) |
| 변하는 것과 안 변하는 것 분리 | 요구사항·IR(안정)과 rhwp 참조(0.x라 변동)를 폴더로 분리 |
| 결정은 `adr/`에만 | 본문에는 결정 결과와 ADR 링크만 두고, 이유와 대안은 ADR에 기록 |
| 규칙은 `04-conversion/`에 집중 | 변환기의 동작 명세는 이곳이 단일 출처(SSOT) |

## 문서 상태

| 문서 | 상태 |
|---|---|
| 01-overview/* | 초안 |
| 02-architecture/* | 초안 |
| 03-rhwp-reference/* | 초안 (0.8.7 타입 정의와 Node 스파이크 기준) |
| 04-conversion/* | 초안 (스파이크 후 확정) |
| 05-interfaces/* | 초안 |
| 06-quality/* | 초안 |
| adr/* | 0001~0005 제안됨 |

상태 값: `초안` → `검토중` → `확정` → `폐기`

## 작성 규칙

- 언어는 한국어, 코드·식별자는 영어 그대로 씁니다.
- 요구사항은 ID(`FR-xx`, `NFR-xx`)로 참조하고, 테스트와 구현이 같은 ID를 인용합니다.
- 검증되지 않은 내용은 **`[검증 필요]`** 로 표시하고 `06-quality/verification-spike.md`의 항목 번호를 답니다.
- rhwp API 이름은 `@rhwp/core@0.8.7`의 `rhwp.d.ts`에서 확인된 것만 적습니다.
- 결정 변경 시 기존 ADR을 수정하지 않고 새 ADR로 대체(supersede)합니다.
