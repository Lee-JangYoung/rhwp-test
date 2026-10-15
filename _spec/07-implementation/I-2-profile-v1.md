# I-2 프로필 형식 v1

상태: **승인됨(2026-10-15), 구현 중.** D1~D12 확정(D4·D10~D12는 권장안으로 승인). D4는 개발자 요구("실제 구현이므로 가능한 다양한 패턴을 수용하도록 설계")에 맞춰 일반화한 바인딩 트리 모델이다.
I-1은 PR #3로 병합됐다([I-1-core-port.md](I-1-core-port.md)). 배경: [doctype-profile.md](../04-conversion/doctype-profile.md), [ADR-0002](../adr/0002-template-file-based-styling.md), [ADR-0006](../adr/0006-template-registration-and-doctype-profile.md).

## 목표
지금 코드에 박혀 있는 매핑을 **설정 파일(프로필)** 로 표현하고, **다양한 양식 패턴을 형식 변경 없이 수용**할 수 있는 형식 v1을 정의한다. 로드·검증·점검 도구를 만든다. 변환 코드를 연결하는 일은 I-3이다. 양식의 시각 요소는 양식 파일에 두고, 프로필은 연결(매핑)과 동작만 정한다.

## 설계 원칙
1. **선언적·조합 가능**: 프로필은 "어디에(양식 위치) 무엇을(md 데이터) 어떻게(동작)"를 잇는 **바인딩의 목록**이다. 바인딩은 중첩할 수 있고 깊이 제한이 없다.
2. **닫힌 동작 집합 + 등록 방식**: 동작(`kind`)은 코드에 등록된 목록 안에서만 쓴다(임의 코드·표현식 없음). 새 패턴은 새 `kind`를 등록해 추가하며 **기존 프로필은 깨지지 않는다**. 각 `kind`는 스키마 조각, 점검 로직, 적용 로직, **검증 상태**를 가진다.
3. **검증된 것만 켠다**: 정의는 했지만 rhwp에서 검증하지 않은 `kind`는 `checkProfile`이 "아직 지원하지 않음"으로 거부한다. 스파이크로 검증해 [verification-spike.md](../06-quality/verification-spike.md)에 기록하면 켠다.
4. **알 수 없는 키·`kind`는 오류**(오타 방지). `version`이 형식을 가리키고, 호환이 깨질 때만 올린다.
5. **데이터 모델은 일반화**: md는 고정된 "유스케이스" 구조가 아니라 **이름 붙은 컬렉션·슬롯**으로 읽는다(아래).
6. **LLM이 쓰고 사람이 고친다**: 프로필은 주로 LLM이 초안을 쓰고(호스트 에이전트, [ADR-0007](../adr/0007-llm-by-host-agent-conversion-llm-free.md)) 사람이 일부를 고친다. 그래서 형식은 다음을 만족해야 한다.
   - **짧게 쓸 수 있다**: 기본값을 둔다(`labelColumn` 0, `valueColumn` 1, `unmappedValue` clear, `onEmpty` error, `output`·`policy` 생략 가능). 최소 프로필은 한 화면이다.
   - **LLM이 틀리기 쉬운 곳을 기계가 잡는다**: 스키마 검증 + `checkProfile`이 **구조화된 오류**를 낸다(`code`, 프로필 경로, 메시지, 기대/실제, **양식에서 찾은 후보**: 예) "라벨 `액터`가 표에 없음, 양식의 라벨: 액터 명, 사전조건, …"). LLM이 이 출력만 보고 스스로 고칠 수 있어야 한다.
   - **스키마가 LLM의 입력이 된다**: `profile.schema.json`의 모든 키에 `description`과 예를 달아, 구조화 출력·프롬프트에 그대로 쓸 수 있다.
   - **사람이 일부만 고칠 수 있다**: 평평하고 읽기 쉬운 YAML, 바인딩마다 선택적 `id`(오류 메시지·대화에서 가리키는 이름), 바인딩끼리 독립(하나를 고쳐도 다른 것이 깨지지 않음), 주석 허용. **도구는 프로필 파일을 다시 쓰지 않는다**(주석·사람이 고친 부분 보존), 점검만 한다.
7. **환각을 줄이는 구조: 가이드 전달 + MCP 도구**. LLM이 추측하지 않고 **사실을 조회해서 쓰게** 한다.
   - **사실은 도구로 조회**: 양식의 라벨·표·누름틀·책갈피는 `analyze_template`이 준 값만 쓴다. 프로필에 적은 위치·라벨이 분석 결과에 없으면 `checkProfile`이 거부한다.
   - **어휘는 닫힌 목록**: `list_kinds`가 **검증된 `kind`만** 스키마·예제와 함께 준다. 정의만 된 `kind`는 노출하지 않는다.
   - **가이드는 코드에서 생성**: 가이드(`kind` 설명, 경로 문법, 위치 지정 문법, 흔한 실수와 오류 코드 표)는 동작 등록부·스키마에서 생성해, 구현과 어긋날 수 없게 한다. 가이드의 모든 예제는 시험에서 스키마·점검을 통과해야 한다(틀린 예제가 환각의 원인이 되지 않도록).
   - **검증 도구로 되돌림**: `check_profile`(구조화 오류+후보), `preview_mapping`(라벨↔값 대조표: 무엇이 어디에 들어가는지), 이후 `profile test`(드라이런). LLM은 점검 통과 전에 결과를 확정하지 않는다.
   - **도구는 순수·읽기 전용**: 입력(프로필 텍스트, 양식)을 받아 JSON을 돌려준다. 파일 쓰기와 저장 위치는 호스트 에이전트가 정한다. 파일 입력은 허용 디렉터리로 제한한다([mcp.md](../05-interfaces/mcp.md)).
   - **I-2에서는 LLM을 호출하지 않는다.** 호스트 에이전트(MCP)와 제품 내 LLM 연결([I-A](I-A-profile-authoring.md))이 함께 쓸 **입력(양식 분석, 스키마, 예제, 작성 가이드)과 점검 루프**만 제공한다(승인 워크플로·권한은 범위 밖).

## 지금 하드코딩된 것 (프로필로 옮길 대상)

| 위치 | 하드코딩 | 프로필 항목 |
|---|---|---|
| `convert.ts` `FIELD_MAP` | front-matter 키 → 누름틀 이름 | `bindings`의 `fields` |
| `parse.ts` | H2 제목 `"{id} {name}"`, 항목 안 첫 표 = 라벨/값, H3 `기본 흐름`·`대안 흐름` = 목록 | `md.collections` |
| `convert.ts` `blockValues` | 라벨 ← 값, 번호 형식 | `cells`의 `map`·`format` |
| `convert.ts` | 양식의 **첫 번째 표**가 반복 단위, 0열 라벨/1열 값 | `repeat`의 `unit` 위치 지정, `cells`의 열 설정 |
| `convert.ts` | 값 없는 라벨 비움, 없는 라벨은 경고 후 누락 | `cells.unmappedValue`, `policy` |
| `convert.ts` | 쪽 나눔 `cell`, 높이 맞춤, 그림 폭·배율 | `output` |
| `schemas/usecase.schema.json` | 유스케이스 전용 규약 | `schema`(참조) |

## 형식 v1 (제안)

**최소 프로필 예** (기본값 덕분에 이 정도로 유스케이스 양식이 동작하는 것이 목표):

```yaml
version: 1
type: usecase
template: template.hwpx
schema: schema.json
md:
  frontMatter: meta
  collections:
    items:
      heading: { level: 2, pattern: '{id} {name}' }
      slots:
        - { as: kv, key: fields }
        - { as: list, key: main, under: 기본 흐름 }
        - { as: list, key: alt, under: 대안 흐름, optional: true }
        - { as: code, key: diagrams, lang: mermaid }
bindings:
  - { kind: fields, map: { meta.title: 문서명, meta.version: 버전, meta.author: 작성자, meta.date: 작성일 } }
  - kind: repeat
    over: items
    unit: { table: { label: UC ID } }
    do:
      - kind: cells
        map: { UC ID: '{id}', 유스케이스명: '{name}', 기본 흐름: { from: main, format: numbered }, 대안 흐름: { from: alt, format: numbered }, '*': fields }
      - { kind: diagrams, from: diagrams }
```
아래는 모든 키를 풀어 쓴 설명이다.

최상위: `version`, `type`, `name`, `template`, `schema`, `md`, `bindings`, `output`, `policy`.

### 1) `md` — md를 이름 붙은 데이터로 읽는 규칙
md의 구조는 문서 유형마다 다르다(항목 제목 H2, 하위 항목 H3, 표, 목록, 코드 블록, 서술 문단). 그래서 **컬렉션**(반복되는 것)과 **슬롯**(그 안의 내용)으로 선언한다. 컬렉션은 다른 컬렉션 안에 둘 수 있다.

```yaml
md:
  frontMatter: meta                  # front-matter → 데이터 이름 meta
  collections:
    items:                           # 데이터 이름
      heading: { level: 2, pattern: '{id} {name}' }   # 캡처: id, name
      slots:                         # 항목 안에서 읽을 내용 (match는 위에서부터 먼저 맞는 것)
        - { as: kv,      key: fields }                              # 첫 key-value 표 (1열=키, 2열=값)
        - { as: list,    key: main, under: 기본 흐름 }              # 해당 제목 아래 목록
        - { as: list,    key: alt,  under: 대안 흐름, optional: true }
        - { as: records, key: attributes, under: 속성 }             # 목록형 표 → 행 레코드(머리행=키)
        - { as: text,    key: summary, under: 개요 }                # 서술 문단
        - { as: code,    key: diagrams, lang: mermaid }             # 코드 블록(여러 개)
      children:                      # 하위 컬렉션 (예: 클래스 아래 메서드 제목)
        methods: { heading: { level: 3, pattern: '{name}' }, slots: [ ... ] }
```
슬롯 종류: `kv`(키-값 표), `records`(목록형 표), `list`, `text`, `code`(언어 지정), `table`(원형 그대로). 모든 슬롯은 줄 번호를 보관해 위반 메시지에 쓴다.

### 2) `bindings` — 양식 위치 × 데이터 × 동작
```yaml
bindings:
  - kind: fields                        # 누름틀
    map: { meta.title: 문서명, meta.version: 버전, meta.author: 작성자, meta.date: 작성일 }

  - kind: repeat                        # 컬렉션 항목마다 양식 영역을 복제
    over: items
    unit: { table: { label: UC ID } }   # 복제할 양식 영역 (위치 지정 참조)
    onEmpty: error                      # 항목이 없을 때: error | remove(영역 삭제) | keep
    do:                                 # 복제본마다 실행 (이 안의 경로는 그 항목 기준)
      - kind: cells                     # 라벨 옆 값 셀에 단일 값
        labelColumn: 0
        valueColumn: 1                  # 또는 value: below(라벨 아래 칸)
        map:
          UC ID: '{id}'
          유스케이스명: '{name}'
          기본 흐름: { from: main, format: numbered }
          대안 흐름: { from: alt,  format: numbered }
          '*': fields                   # 나머지 key-value는 같은 이름의 라벨로
        unmappedValue: clear            # 값이 없는 라벨: clear | keep
      - kind: diagrams                  # mermaid 코드 → 그림
        from: diagrams
        place: afterUnit                # afterUnit | atMarker
```

**위치 지정(양식 안의 어디)** — `unit`, `in`, `at` 등에서 같은 문법:

| 위치 | 의미 |
|---|---|
| `{ table: { label: X } }` | 0열(또는 지정 열)에 라벨 X가 있는 표 |
| `{ table: { headerLabel: X } }` | 머리행에 X가 있는 표 |
| `{ table: { index: n } }` | 문서에서 n번째 표 |
| `{ table: { text: X } }` | 표 안 어딘가에 X가 있는 표 |
| `{ range: { start: <위치>, end: <위치> } }` | 시작~끝 사이의 연속 본문 요소(문단·표 여러 개), 책갈피·제목 문단·표로 지정 |
| `{ paragraph: { text: X } }` / `{ style: S }` / `{ bookmark: B }` | 문단 |
| `{ row: { label: X } }` | 표 안의 행 |
| `{ field: X }` / `{ bookmark: X }` | 누름틀 / 책갈피 |
| 생략 | 바깥 영역(`do` 안에서는 복제된 단위) |

**동작 `kind` 목록(v1 정의)**

| kind | 하는 일 | 대표 패턴 |
|---|---|---|
| `fields` | 누름틀 채움 | 표지·문서 정보 |
| `cells` | 라벨 옆(오른쪽·아래) 값 셀 채움 | 항목 헤더 표(유스케이스, 클래스 개요) |
| `repeat` | 영역(표·범위·문단·행)을 컬렉션 항목 수만큼 복제하고 `do`를 실행 | 항목마다 표/블록 반복. **중첩 가능** |
| `rows` | 표의 견본 행을 레코드 수만큼 복제해 열마다 채움 | 속성·메서드·컬럼 정의·인터페이스 목록, 개정이력 |
| `paragraphs` | 문단(또는 문단 묶음)을 목록·서술 수만큼 채움/복제 | 서술형 절, 번호 목록 본문 |
| `diagrams` | 코드 블록(mermaid)을 그림으로 삽입 | 다이어그램 |
| `remove` | 조건에 따라 영역 삭제(`when: empty(경로)` 또는 `exists(경로)`) | 선택 항목(대안 흐름 없음)의 행·표 제거 |
| `text` | 문단 안 토큰(`{{경로}}`) 치환 | 본문 속 값 삽입 |

값 표기: 자리표시자 `'{id}'`, 또는 `{ from: 경로, format, default }`. `format`: `plain`(기본)·`numbered`·`bulleted`·`lines`·`join`. 경로는 점 표기이고 `repeat` 안에서는 그 항목 기준이다. 조건은 `empty`·`exists`만 쓴다(표현식 언어 없음).

### 3) `output`·`policy`
```yaml
output:
  tablePageBreak: cell               # none | table | cell
  fitHeights: true
  diagram: { maxWidthHu: 40000, scale: 2 }
policy:                              # 위반 시: error | warn | ignore  (기본 모두 error)
  onMissingLabel: error              # 매핑한 라벨·위치가 양식에 없음
  onMissingField: error              # 누름틀이 없음
  onMissingRenderer: error           # 렌더러 없음
  onUnmappedData: warn               # md에 있으나 어디에도 쓰이지 않은 데이터
```

## 패턴 수용 범위 (SI 산출물)

| 패턴 | 표현 | 필요한 kind | 상태 |
|---|---|---|---|
| 표지·문서 정보 | 누름틀 | `fields` | 확인됨 |
| 항목마다 표 1개(유스케이스) | `repeat`(table)+`cells` | | 확인됨 → I-3 |
| 라벨 아래 칸에 값 | `cells.value: below` | | 구현 시 검증(I-3) |
| 항목마다 헤더 표 + 목록 표(클래스·DB 명세서) | `repeat`+`cells`+`rows` | `rows` | 행 복제·채움 미검증 → I-5 |
| 항목 안의 목록 표 하위 반복(속성→제약 등) | `repeat` 중첩 | | I-5 |
| 문서 전체가 하나의 목록 표(인터페이스 목록, 용어집) | 바깥 `rows` | | I-5 |
| 개정이력 표(front-matter 목록) | `rows` | | I-5 |
| 선택 항목이 없으면 행·표 제거 | `remove` | | 행 삭제 API 확인, 나머지 I-5 |
| 항목마다 문단+표 여러 개 묶음 | `repeat`(range) | | 책갈피·블록 복제 미검증(R-02, S-10) → 실제 양식 확인 후 스파이크 |
| 서술형 절·번호 목록 본문 | `paragraphs` | | 미검증 |
| 문단 안 값 삽입 | `text` | | `replaceOne`이 표 셀에서 안 됨, 본문 한정 → 미검증 |
| 다이어그램 | `diagrams` | | 확인됨(I-3) |
| 다중 구역 양식 | — | | 제외(v1), 분석 단계에서 거부 |
| 예시가 채워진 양식(라벨 별칭·위치 지정) | 위치 지정 `table.text` 등으로 일부 | | 실제 양식 확인 후 보강 |

미검증 `kind`도 **형식에는 정의**하고 스키마가 구조를 검사하지만, `checkProfile`은 "아직 지원하지 않음"으로 거부한다. 패턴이 새로 필요해지면 ① 스파이크로 rhwp에서 검증 → ② 검증 기록 → ③ 해당 `kind` 활성화 순서로 추가한다. 위 목록에 없는 패턴은 새 `kind`(또는 위치 지정 종류)를 등록하며 형식 버전은 올리지 않는다.

## 작업
1. **스키마**: `profile.schema.json`. 최상위·`md`·`output`·`policy`는 고정 스키마, `bindings`는 `kind`별 스키마 조각을 합성(`oneOf`). 알 수 없는 키·`kind` 금지. 위반은 프로필 파일 경로와 키 경로로 보고한다.
2. **동작 등록부**: `packages/core/src/profile/kinds/` — `kind`마다 스키마 조각, `check()`, 상태(`verified` | `defined`)를 가진다. I-2에서는 `fields`·`cells`·`repeat`(table)·`diagrams`가 `verified`, 나머지는 `defined`(적용 로직 없음).
3. **타입·로더**: `packages/core/src/profile/` — `load.ts`(YAML 파싱 → 스키마 검증 → 타입). 환경 중립(파일 읽기는 호출자가 바이트·문자열로 주입, Node 편의 함수는 `node/`).
4. **점검** `checkProfile(engine, profile, template)`: 위치 지정이 양식에서 해석되는지(표·행·누름틀·책갈피), `cells.map` 라벨이 표에 있는지, `schema`의 필수 항목이 바인딩으로 덮이는지, `defined` 상태 `kind` 사용 여부, `policy` 일관성. 결과는 **구조화된 오류/경고 목록(JSON)**: `code`, `severity`, 프로필 경로(`bindings[1].do[0].map`)·바인딩 `id`, 메시지, `expected`/`actual`, **`candidates`**(양식에서 찾은 비슷한 라벨·표·누름틀, 가까운 철자 순). LLM이 이 결과만으로 고칠 수 있는지가 설계 기준이다.
4-2. **도구 준비형 코어 API**: MCP·CLI가 같은 함수를 얇게 감싸도록 입력·출력이 JSON인 순수 함수로 제공한다 — `analyzeTemplate`, `describeKinds`(검증된 `kind`의 스키마·예제), `getProfileGuide(topic)`(코어가 생성), `checkProfile`, `previewMapping`. 출력 형식은 JSON Schema로 고정하고 시험한다.
4-1. **양식 분석 출력(LLM 입력)**: `analyze()`가 프로필 작성에 필요한 사실을 낸다(표별 라벨·머리행·병합, 누름틀, 책갈피, 개요). 현재 값에 더해 표 안 텍스트 요약과 라벨 후보를 JSON으로 안정적으로 출력하도록 정리한다.
5. **유스케이스 프로필 작성**: `templates/usecase/profile.yaml`. 합성 양식에 점검을 통과시킨다.
6. **시험**: 정상 로드, 잘못된 프로필별 오류(알 수 없는 키·`kind`, 필수 키 누락, 값 형식), 양식에 라벨·누름틀이 없을 때 점검 실패, `defined` `kind` 거부, 정상 양식에서 통과. 클래스·DB 명세서 형태의 **프로필 예제(검증 전)** 가 스키마 검증은 통과하는지(형식이 그 패턴을 표현할 수 있는지)도 시험한다. 공개 API 범위 시험에 추가.
7. **문서**: [doctype-profile.md](../04-conversion/doctype-profile.md)의 초안 절을 v1 명세로 교체하고, **"LLM으로 프로필 쓰기" 절**(입력: 양식 분석 JSON·스키마·예제 프로필·예제 md, 루프: 초안 → `checkProfile` 오류 → 수정, 사람이 고칠 때의 규칙)을 두고, **프로필 파일 스키마 구성을 문서화**한다(모든 키의 이름·타입·필수 여부·기본값·설명·구현 상태를 표로, 폴더 구성과 예제 포함, `profile.schema.json`과 일치하는지 시험으로 확인). ADR-0016 기록.

## 완료 기준
- `pnpm check` 통과, CI 통과. 기존 시험 13개가 그대로 통과한다(변환 동작은 바뀌지 않는다).
- `templates/usecase/profile.yaml`이 스키마 검증과 `checkProfile`을 통과하고, 라벨·누름틀을 일부러 지운 양식에서는 어떤 바인딩이 왜 틀렸는지 알려 준다.
- 클래스·DB 명세서 형태 프로필 예제가 스키마 검증을 통과한다(`checkProfile`은 `defined` `kind`로 거부).
- **가이드 일관성 시험**: `getProfileGuide`가 생성한 모든 예제 프로필이 스키마와 `checkProfile`(합성 양식)을 통과한다. 새 `kind`를 등록하면 가이드에 자동 반영된다. `describeKinds`는 `verified` 상태만 낸다.
- **LLM 작성 시험**: LLM이 자주 내는 오류(오타 키·`kind`, 없는 라벨, 잘못된 enum, 경로 오타, 필수 바인딩 누락)를 일부러 넣은 프로필들이 각각 **오류 코드·경로·후보를 포함한 구조화 오류**로 보고된다. 최소 프로필 예가 기본값만으로 점검을 통과한다.
- 새 `kind`를 등록하는 데 필요한 변경이 `kinds/` 한 곳과 시험으로 한정된다(등록 방식 확인용으로 시험 전용 `kind` 1개를 등록해 본다).

## 결정 사항

| # | 결정 | 상태 |
|---|---|---|
| D1 | 프로필 폴더 구성 `templates/<유형>/`(`profile.yaml`, 양식, `schema.json`, 예제) + 프로필 파일 스키마 구성 문서화 | **확정** |
| D2 | YAML | **확정** |
| D3 | 항목 제목 패턴은 자리표시자(`'{id} {name}'`) | **확정** |
| **D4** | **반복·채움 모델**: (a) 개정안 — 바인딩 트리(`kind` 등록부, 위치 지정 문법, 데이터 컬렉션·슬롯 모델, 중첩 가능). 미검증 `kind`는 정의만 하고 거부, 검증 후 활성화. **권장** (b) 이전안 — `repeat.unit`(table\|block) + `fill`(cells\|rows) 2층 고정 | **확정(권장안 (a))** |
| **D11** | **LLM 작성 지원 범위**: I-2는 형식·스키마·점검 출력을 LLM 친화로 설계(기본값, 구조화 오류+후보, `description` 달린 스키마, 선택적 `id`, 파일 비수정) + "LLM으로 프로필 쓰기" 절 + 양식 분석 JSON 정리까지. **제품 내 LLM 호출·프로필 생성기·검토 보고서는 별도 단계 [I-A](I-A-profile-authoring.md)**(개발자 요구, 승인 대기) | **확정**: I-2는 LLM 호출 없음, 제품 내 LLM은 I-A |
| **D12** | **MCP 도구 시점**(개발자 요구: 환각 최소화를 위해 가이드 전달과 MCP 도구 제공). (a) I-2는 도구 준비형 코어 API까지, **MCP 서버는 I-4(CLI) 직후 "프로필 작성 도구"만 먼저**(`analyze_template`, `list_kinds`, `get_guide`, `check_profile`, `preview_mapping`), 변환 도구(`validate_md`, `convert_md` 등)는 I-7 **권장** (b) I-2에서 바로 얇은 MCP 서버까지 구현 (c) 전부 I-7 | **확정(권장안 (a))** |
| D5 | 값 없는 라벨 기본 `clear`(`cells.unmappedValue`) | **확정** |
| D6 | 정책 기본값 `error`, 항목별 `warn`·`ignore` | **확정** |
| D7 | md 규약은 별도 JSON Schema 파일 참조 | **확정** |
| D8 | 스타일 참조 제외(양식 셀 스타일 상속) | **확정** |
| D9 | `checkProfile` CLI는 I-4 | **확정** |
| D10 | 구현 시점: I-3에 `fields`·`cells`·`repeat`(table)·`diagrams`를 변환에 연결, I-5에 `rows`·중첩·`remove`·`paragraphs`(클래스·DB 명세서로 검증), `range`·`text`는 실제 양식에서 필요가 확인될 때 스파이크 후 활성화 | **확정(권장안 (a))** |

## 위험
- 합성 양식 하나로 형식을 정한다. 실제 SI 양식에서 위치 지정이나 `kind`가 모자랄 수 있다. 그래서 등록 방식(원칙 2)과 "새 패턴은 `kind` 추가로 대응"을 형식의 일부로 둔다. 모자란 점은 I-5·I-6에서 보강한다.
- 일반화한 `md` 모델(컬렉션·슬롯)과 파서 구현은 I-3 범위이므로, 그때 `md` 절의 세부 조정이 생길 수 있다. 호환이 깨지면 `version`을 올린다.
- 도구와 가이드를 제공해도 환각이 **0이 되지는 않는다**. 그래서 점검·미리보기·드라이런으로 사람이 확인하는 지점을 남긴다(사람이 일부를 고치는 요건과 같은 이유).
- LLM이 쓴 프로필이 점검을 통과해도 **변환 결과가 맞는다는 보장은 아니다**. 예제 md로 변환해 보는 **드라이런**(R-03)이 필요하며, 변환 연결(I-3)·CLI(I-4)에서 `profile test`로 제공한다.
- 범용성을 위해 형식이 커진다. 사람이 쓰기 어렵지 않도록 문서화와 예제(유스케이스·클래스·DB 명세서 형태)를 함께 제공한다.
