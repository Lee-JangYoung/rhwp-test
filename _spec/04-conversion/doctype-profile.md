# 문서 유형 프로필

결정: [ADR-0006](../adr/0006-template-registration-and-doctype-profile.md), [ADR-0007](../adr/0007-llm-by-host-agent-conversion-llm-free.md)(등록 단계는 [ADR-0017](../adr/0017-llm-in-authoring-only.md)로 부분 대체), [ADR-0016](../adr/0016-profile-format-binding-tree.md). 형식 v1은 합성 양식 1종에서 검증됐으며 실제 양식으로 보강한다(S-01, S-03, S-10, R-01).

## 개념
**프로필**은 문서 유형 하나(유스케이스·클래스·DB 명세서)의 변환 정의다. 양식(HWPX)을 기준으로 만들고, 변환은 프로필만 보고 수행한다. 파일 묶음이라 git으로 관리한다.

```
templates/<유형>/
├── profile.yaml     # 프로필(바인딩 트리): md 읽기 규칙 + 양식과의 연결 + 동작
├── template.hwpx    # 양식 원본 (개인정보 제거본)
├── schema.json      # md 규약(JSON Schema)
├── example.md       # 예제 md (드라이런·가이드용)
└── prompt.md        # (계획) md를 쓰는 LLM에게 줄 작성 지침
```

## 흐름
```
[등록, 양식당 1회] 양식 → 분석(프로그램) → 프로필 작성(사람, 필요 시 LLM 보조) → 커밋
[변환, 문서마다]   example.md·prompt.md → AI가 md 작성 → 규약 검증 ⇄ 수정 → 변환 → 검증 → HWPX
```
1차는 사람이 프로필을 작성하고 분석 도구(`analyze`)가 보조한다. LLM 해석을 이용한 자동 초안은 후순위.

## 프로그램 vs LLM 분담
원칙: **LLM은 의미 해석과 md 작성에만, 변환·검증은 결정적(프로그램)으로.** LLM 결과는 스키마로 검증한 뒤 파일로 고정한다. 변환 시점에는 LLM을 쓰지 않는다.

| 작업 | 담당 |
|---|---|
| 양식의 표 구조·병합·머리행·필드·스타일·개요 추출 | 프로그램 |
| 반복 블록 후보 탐지 | 프로그램(휴리스틱) |
| 표의 의미 해석, 항목명 키 명명, 필수/타입 추정, 작성 지침 | LLM 보조 (후순위) |
| 프로필 확정 | 사람 |
| md 본문 작성 | LLM(사용자 측) |
| 규약 검증, 변환, 재로드·쪽수·텍스트·손실 검증 | 프로그램 |
| 한컴에서 열림·충실도 확인 | 사람 |

## 대상 문서 유형 (SI 산출물)
"항목 1건 = 블록이 반복되는 표 중심 문서"다. 열 구성은 실제 양식에서 도출한다.

| 유형 | 블록 구성 (예시) |
|---|---|
| 유스케이스 명세서 | 헤더 정보(ID, 액터, 사전/사후조건) + 기본/대안/예외 흐름(번호 목록) + 다이어그램 |
| 클래스 명세서 | 헤더 정보 + 속성표 + 메서드표 + 관계 |
| DB 명세서(테이블) | 헤더 정보 + 컬럼 정의표 + 인덱스/제약표 + ERD |

## 입력 규약 공통 규칙
1. 문서 1개 = 유형 1개, front-matter에 `type`을 둔다.
2. 항목 1건 = H2 하나(`## UC-001 로그인`).
3. 헤더 정보는 2열 표(`항목|내용`), 목록형 표는 열 이름·순서 고정.
4. 흐름은 번호 목록, 다이어그램은 ```` ```mermaid ````.
5. 병합 셀·원시 HTML 금지(병합은 양식 쪽에서 처리).
6. 위반은 줄 번호·기대 값을 포함한 메시지로 반환한다.

## 프로필 형식 v1 (구현됨, I-2)
형식은 **바인딩 트리**다: "양식의 어디에(위치 지정), md의 무엇을(데이터), 어떻게(동작 kind)"를 잇는 목록이며 중첩할 수 있다([ADR-0016](../adr/0016-profile-format-binding-tree.md)). 키 전체의 이름·종류·필수 여부·기본값·설명은 **[profile-reference.md](profile-reference.md)**(코드에서 자동 생성)가 기준이고, JSON Schema는 `packages/core/schema/profile.schema.json`이다.

**폴더 구성** (`templates/<유형>/`, 경로는 프로필 폴더 기준)
```
profile.yaml      # 프로필 (이 형식)
template.hwpx     # 양식
schema.json       # md 규약(JSON Schema)
example.md        # 예제 md
```
문서 유형 예제(합성 양식 포함, 변환·시험됨): `templates/usecase`(항목마다 표 1개), `templates/class-spec`(표 묶음 + 행 목록 + 중첩 반복), `templates/db-spec`(행·표 삭제), `templates/report`(토큰·문단, 프로필은 kind 예제).

**구성 요소**
- `md`: md를 이름 붙은 **컬렉션**(반복되는 제목)과 **슬롯**(kv·records·list·text·code·table)으로 읽는 규칙. 컬렉션은 중첩할 수 있다.
- `bindings`: 동작 목록. kind는 코드의 **등록부**(`kinds.ts`)에서만 추가되고, 스키마·가이드·점검이 모두 이 등록부에서 만들어진다.
- `output`, `policy`: 출력 옵션, 위반 시 동작(기본 모두 `error`). 모두 생략 가능(기본값).
- 알 수 없는 키·kind는 오류. 형식이 깨질 때만 `version`을 올린다.

**kind 상태**: 사용 가능(검증됨, 합성 양식 기준) `fields`·`cells`·`repeat`(표·`range` 표 묶음·중첩)·`diagrams`·`rows`·`remove`·`text`·`paragraphs`. 위치 지정은 `table`(와 repeat.unit의 `range`, `remove`의 `row`, `paragraphs`의 `paragraph.text`)만 지원하고 `field`·`bookmark`·`paragraph.style` 등은 정의만 됨(점검이 거부). 새 kind는 스파이크 → [verification-spike.md](../06-quality/verification-spike.md) 기록 → 활성화 순서로 켠다.

## 반복·채움 패턴 수용 범위
| 패턴 | 표현 | 상태 |
|---|---|---|
| 표지·문서 정보 | `fields` | 사용 가능 |
| 항목마다 표 1개(유스케이스) | `repeat`(table) + `cells` | 사용 가능 |
| 항목마다 여러 표(헤더 표 + 목록 표 …) | `repeat`(unit: `range`) + `cells` + `rows` | 사용 가능(합성 양식) |
| 표의 행 목록, 문서 전체가 하나의 목록 표, 개정이력 | `rows`(바깥이면 repeat 없이) | 사용 가능(합성 양식) |
| 항목 안에서 다시 반복(메서드마다 표) | `repeat` 중첩 | 사용 가능(합성 양식) |
| 선택 항목이 없으면 행·표 제거 | `remove`, `repeat.onEmpty: remove` | 사용 가능(합성 양식) |
| 본문 토큰 치환, 표식 문단을 목록으로 전개 | `text`, `paragraphs` | 사용 가능, **repeat 밖·front-matter 값만**. 항목마다 달라지는 서술 절은 문단 복제가 필요해 미지원 |
| 표 사이 문단까지 포함한 블록 반복 | — | 미지원(표 사이 문단은 복제하지 않음, 실제 양식에서 필요가 확인될 때) |
| 다중 구역 양식 | — | 제외(분석 단계에서 거부) |

새 패턴은 새 kind(또는 위치 지정)를 등록해 추가하며 형식 버전은 올리지 않는다.

## LLM으로 프로필 쓰기 (환각 줄이기)
프로필은 주로 LLM이 초안을 쓰고 사람이 일부를 고친다. LLM이 추측하지 않고 **사실을 조회해서** 쓰도록 코어가 다음을 제공한다(JSON 입출력의 순수 함수, MCP·CLI·제품 내 LLM이 같이 쓴다).

| 함수 | 역할 |
|---|---|
| `analyzeTemplate(engine, template)` | 양식의 사실: 표별 라벨(0열)·머리글·병합, 누름틀, 글꼴. **프로필의 위치·라벨·누름틀 이름은 이 결과에 있는 것만 쓴다** |
| `describeKinds()` | **검증된 kind만** 스키마·예제와 함께 준다(미검증 kind는 `includeDefined` 없이는 노출하지 않음) |
| `getProfileGuide(topic)` | 작성 가이드(개요·최소 예·키·kind·위치 지정·경로·오류 코드). 등록부·스키마에서 생성되고, 가이드 속 모든 예제가 시험에서 스키마·점검을 통과한다 |
| `parseProfile(text)` | YAML 문법과 스키마를 검증하고 기본값을 채운다. 오류에 **줄 번호** |
| `checkProfile(engine, profile, template)` | 양식 대조 점검. 오류는 `code`·`path`·`line`·`id`·`candidates`(양식에서 찾은 가까운 라벨·누름틀 등)를 가진 JSON |

**루프**: 초안 → `parseProfile`/`checkProfile` 오류 → 후보를 보고 수정 → 통과할 때까지 반복. 통과해도 변환 결과가 맞다는 보장은 아니므로 예제 md로 변환해 보는 드라이런(`testProfile`, I-3)과 사람의 확인이 필요하다.

**사람이 고칠 때**: 평평한 YAML이고 바인딩은 서로 독립이다(선택적 `id`로 가리킨다). 도구는 프로필 파일을 다시 쓰지 않는다(주석 보존). 고친 뒤 같은 점검을 다시 돌린다. 제품 내 LLM 생성·검토(`@yangsik/author`의 `generateProfile`)는 같은 함수를 도구로 쓰며, 반복 횟수·토큰 상한과 검토 보고서(커버리지·드라이런·근거)를 만든다. 상세와 현재 검증 범위는 [I-A](../07-implementation/I-A-profile-authoring.md).
