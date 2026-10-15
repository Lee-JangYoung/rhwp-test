# I-2 프로필 형식 v1

상태: D1~D3·D5~D9 확정(2026-10-15). **D4(반복 유형 정의)는 정의안 승인 대기** — 승인 전에는 구현을 시작하지 않는다. I-1은 PR #3로 `main`에 병합됐다([I-1-core-port.md](I-1-core-port.md)). 배경: [doctype-profile.md](../04-conversion/doctype-profile.md), [ADR-0002](../adr/0002-template-file-based-styling.md), [ADR-0006](../adr/0006-template-registration-and-doctype-profile.md).

## 목표
지금 코드에 박혀 있는 매핑을 **설정 파일(프로필)** 로 표현할 수 있게 **형식 v1을 정의하고, 로드·검증·점검 도구를 만든다.** 변환 코드를 프로필에 연결하는 일은 I-3이다. 양식의 시각 요소는 양식 파일에 두고, 프로필은 연결(매핑)과 동작만 정한다.

## 지금 하드코딩된 것 (프로필로 옮길 대상)

| 위치 | 하드코딩 | 프로필 항목 |
|---|---|---|
| `convert.ts` `FIELD_MAP` | front-matter 키 → 누름틀 이름 | `md.frontMatter` |
| `parse.ts` | H2 제목 `"{id} {name}"`, 항목 안 첫 표 = 라벨/값, H3 `기본 흐름`·`대안 흐름` = 목록 | `md.item` |
| `convert.ts` `blockValues` | 라벨 `UC ID`·`유스케이스명`·`액터`… ← 어떤 값, 번호 형식 | `repeat.fill[].map` |
| `convert.ts` | 양식의 **첫 번째 표**가 반복 단위, 0열 라벨/1열 값 | `repeat.unit`, `repeat.find`, `repeat.fill[].labelColumn`·`valueColumn` |
| `convert.ts` | 값 없는 라벨은 비움, 없는 라벨은 경고 후 누락 | `repeat.fill[].unmappedValue`, `policy` |
| `convert.ts` | 쪽 나눔 `cell`, 높이 맞춤, 그림 폭 40000 HU, 배율 2 | `output` |
| `schemas/usecase.schema.json` | 유스케이스 전용 규약 | `schema`(참조) |

## 형식 v1 (제안)

```yaml
version: 1
type: usecase
name: 유스케이스 명세서
template: template.hwpx            # 프로필 폴더 기준 상대 경로
schema: schema.json                # md 규약(JSON Schema), 프로필 폴더 기준

md:
  frontMatter:                     # md front-matter 키 → 양식 누름틀 이름
    title: 문서명
    version: 버전
    author: 작성자
    date: 작성일
  item:                            # 항목 1건 = 제목 1개
    heading: { level: 2, pattern: '{id} {name}' }
    keyValueTable: true            # 항목 안 첫 표: 1열=라벨, 2열=값 → fields
    sections:                      # 하위 제목 → 키
      - { heading: 기본 흐름, key: main, as: list }
      - { heading: 대안 흐름, key: alt, as: list, optional: true }
    diagrams: true                 # ```mermaid 블록 → 그림

repeat:                            # 항목 1건마다 양식의 어떤 부분을 반복하는가 (아래 "반복 유형")
  unit: table                      # table | block
  find: { label: UC ID }           # unit=table: 반복할 표 = 0열에 이 라벨이 있는 표 (또는 { index: 0 })
  fill:                            # 반복 단위 안에서 값을 넣는 방식 (여러 개 가능)
    - kind: cells                  # 라벨 셀 옆 값 셀에 단일 값을 넣는다
      labelColumn: 0
      valueColumn: 1
      map:                         # 양식 라벨 → 값
        UC ID: '{id}'
        유스케이스명: '{name}'
        기본 흐름: { from: sections.main, format: numbered }
        대안 흐름: { from: sections.alt, format: numbered }
        '*': fields                # 나머지 key-value 행은 같은 이름의 라벨로
      unmappedValue: clear         # 값이 없는 라벨: clear(안내 문구 비움) | keep

output:
  tablePageBreak: cell             # none | table | cell
  fitHeights: true
  diagram: { place: afterBlock, maxWidthHu: 40000, scale: 2 }

policy:                            # 위반 시 동작: error | warn | ignore
  onMissingLabel: error            # 매핑한 라벨이 양식에 없음
  onMissingField: error            # 매핑한 누름틀이 양식에 없음
  onMissingRenderer: error         # 다이어그램 렌더러 없음
```

- **알 수 없는 키는 오류**(오타 방지). `version`은 필수이며 형식이 바뀌면 올린다.
- 값 표기: `'{id}'` 형태의 자리표시자, 또는 `{ from, format }`. `format`은 `plain`(기본)·`numbered`.
- **제외(v1)**: 조건문, 항목 안의 항목(3단 이상 중첩), 스타일 이름 매핑(양식 셀에서 상속), 다중 구역 양식, 예시가 채워진 양식의 라벨 별칭·위치 지정.

## 반복 유형 (D4 정의안)

SI 산출물의 반복은 표 하나가 복제되는 경우만이 아니다. 예: 클래스 명세서는 클래스마다 헤더 표 + 속성 표 + 메서드 표가 있고, 속성·메서드는 **행이 반복**된다. 그래서 반복을 두 층으로 정의한다.

**1층 `repeat.unit` — 항목(md의 H2 한 건)마다 복제하는 양식 요소**

| unit | 복제 대상 | 양식에서 찾는 법 | 구현 상태 |
|---|---|---|---|
| `table` | 표 하나 | `find: { label }` 또는 `{ index }` | rhwp에서 확인됨(R-02): `copyControl`+`pasteControl` |
| `block` | 연속한 본문 요소 묶음(문단·표 여러 개) | 시작·끝 책갈피 `start: { bookmark }`, `end: { bookmark }` | 책갈피 조회(`getBookmarks`)와 `importParagraphBlock`은 있으나 **셀 내부 구조가 있는 블록에서 18/26만 성공**(R-02), 책갈피 범위 지정은 미검증(S-10). 실제 양식에서 필요가 확인될 때 구현 |

**2층 `repeat.fill[]` — 복제된 단위 안에 값을 넣는 방식**

| kind | 하는 일 | 값의 출처(md) | 구현 상태 |
|---|---|---|---|
| `cells` | 라벨 셀 옆 값 셀에 단일 값을 넣는다 | 항목의 key-value 표, 제목, 하위 섹션 | PoC에서 확인됨 |
| `rows` | 표의 데이터 행(양식의 견본 행)을 레코드 수만큼 복제해 열마다 값을 넣는다 | 항목 안의 목록형 표(예: 속성·컬럼 정의) | rhwp `insertTableRow`·`deleteTableRow` 확인됨(S-05). **행 복제 후 셀 채움은 미검증** → I-5(클래스·DB 명세서)에서 구현·검증 |

각 `fill`은 `find`로 단위 안의 어느 표인지 지정한다(생략하면 단위 자체가 표). `rows` 예:

```yaml
  fill:
    - kind: cells
      find: { label: 클래스명 }
      map: { 클래스명: '{name}', 설명: { from: fields.설명 } }
    - kind: rows                   # (I-5)
      find: { label: 속성명 }      # 머리행에 이 라벨이 있는 표
      headerRows: 1
      from: tables.attributes      # md 항목 안의 목록형 표
      columns: { 속성명: name, 타입: type, 설명: desc }
```

- v1 로더·스키마는 **위 구조를 모두 정의**하되, `checkProfile`은 구현되지 않은 유형(`block`, `rows`)을 쓴 프로필에 "아직 지원하지 않음" 오류를 낸다. I-3에서 `table`+`cells`를 변환에 연결하고, `rows`는 I-5, `block`은 필요 시 구현한다.
- 같은 1층 아래 서로 다른 표를 채우는 `fill`을 여러 개 둘 수 있어 클래스·DB 명세서의 "헤더 표 + 목록 표" 구조를 표현한다.

## 작업
1. **스키마**: `profile.schema.json`(JSON Schema, 알 수 없는 키 금지). 위반은 프로필 파일 경로와 키 경로로 보고한다.
2. **타입·로더**: `packages/core/src/profile/` — `types.ts`, `load.ts`(YAML 파싱 → 스키마 검증 → 타입), 환경 중립(파일 읽기는 호출자가 바이트·문자열로 주입, Node 편의 함수는 `node/`).
3. **점검** `checkProfile(engine, profile, template)`: 양식에 필요한 것이 다 있는지 확인한다. 반복 단위(표) 존재, `fill[].map` 라벨이 표에 있는지, 누름틀이 있는지, `schema`의 필수 항목이 `map`으로 덮이는지, `unmappedValue`·`policy` 일관성. 결과는 오류/경고 목록(JSON).
4. **유스케이스 프로필 작성**: `templates/usecase/profile.yaml`을 위 예와 같이 두고 합성 양식에 점검을 통과시킨다.
5. **시험**: 정상 프로필 로드, 잘못된 프로필별 오류(알 수 없는 키, 없는 필수 키, 값 형식), 양식에 라벨·누름틀이 없을 때 점검 실패, 정상 양식에서 점검 통과. 공개 API 범위 시험에 추가.
6. **문서**: [doctype-profile.md](../04-conversion/doctype-profile.md)의 초안 절을 v1 명세로 교체하고, **프로필 파일 스키마 구성을 문서화**한다(모든 키의 이름·타입·필수 여부·기본값·설명·구현 상태를 표로, 폴더 구성과 예제 포함, `profile.schema.json`과 일치하는지 시험으로 확인). ADR-0016 기록.

## 완료 기준
- `pnpm check` 통과, CI 통과.
- `templates/usecase/profile.yaml`이 스키마 검증과 `checkProfile`을 통과하고, 라벨·누름틀을 일부러 지운 양식에서는 어떤 항목이 왜 틀렸는지 알려 준다.
- 변환 동작은 바뀌지 않는다(I-3에서 연결). 기존 시험 13개가 그대로 통과한다.

## 결정 사항 (개발자 승인 필요)

| # | 결정 | 선택지 | 권장과 근거 |
|---|---|---|---|
| D1 | 프로필 파일 구성 | (a) 문서 유형 폴더 `templates/<유형>/` 에 `profile.yaml` + 양식 + `schema.json` + 예제 (b) 단일 파일에 모두 포함 | **확정: (a)** + 프로필 파일 스키마 구성(키 레퍼런스)을 문서화한다 |
| D2 | 파일 형식 | (a) YAML (b) JSON | **확정(개발자 승인)** — **(a)**. 주석을 쓸 수 있고 사람이 편집한다. `yaml` 의존성은 이미 있다 |
| D3 | 항목 제목 패턴 표기 | (a) 자리표시자 `'{id} {name}'` (b) 정규식(이름 있는 그룹) | **확정(개발자 승인)** — **(a)**. 사람·LLM이 읽고 쓰기 쉽다. 내부에서 정규식으로 컴파일한다. 복잡한 패턴이 필요해지면 `regex:` 키를 추가한다(v2) |
| D4 | 반복 유형 | 개발자 요구: 반복이 표만 있지 않을 수 있으니 어떤 반복인지 정의 | **정의안 승인 대기** — 위 "반복 유형" 절. 선택지: (a) 모델 전체를 v1에 정의하고 `table`+`cells`만 구현, `rows`는 I-5, `block`은 필요 시(권장) (b) `rows`까지 I-3에서 구현(검증 안 된 행 채움이 I-3에 들어옴) (c) `block`까지 v1에서 구현(R-02·S-10 미검증 위험) |
| D5 | 값이 없는 라벨의 기본 동작 | (a) `clear`(양식 안내 문구를 비움) (b) `keep` | **확정(개발자 승인)** — **(a)**. 현재 PoC 동작과 같고, 안내 문구("(입력)")가 산출물에 남는 것을 막는다 |
| D6 | 정책 기본값 | (a) 모두 `error`, 항목별로 `warn`·`ignore` 선택 (b) 기본 `warn` | **확정(개발자 승인)** — **(a)**. 지금은 라벨이 없으면 경고만 하고 값이 조용히 빠진다. LLM에 되돌려 고치게 하려면 실패가 기본이어야 한다 |
| D7 | md 규약(스키마) 연결 | (a) 별도 JSON Schema 파일을 `schema:`로 참조 (b) 프로필에서 스키마를 생성 | **확정(개발자 승인)** — **(a)**. 도구(Ajv)와 오류 메시지 체계가 이미 있다. 프로필과 스키마가 어긋나는 것은 `checkProfile`이 잡는다 |
| D8 | 스타일 참조(`style:` 항목) | (a) v1에서는 제외, 양식 셀 스타일 상속 (b) 포함 | **확정(개발자 승인)** — **(a)**. 사용자 결정(전부 설정하지 않음)과 S-03 미검증 때문이다 |
| D9 | `checkProfile`의 CLI 노출 | (a) I-2에서는 core 함수와 시험만, 명령은 I-4(`profile check`) (b) I-2에서 명령까지 | **확정(개발자 승인)** — **(a)**. CLI 명령 재설계가 I-4다 |

## 위험
- 합성 양식 하나로만 형식을 정한다. 실제 SI 양식(병합 셀, 머리행 구조 등)에서 모자랄 수 있어, v1은 "유스케이스 1종에서 검증된 형식"으로 두고 I-5·I-6에서 보강한다.
- md 파싱도 프로필 기반으로 일반화해야 하는데(현재 `UseCaseItem` 고정), 이는 I-3에서 한다. I-2의 `md` 절은 그때 읽혀 쓰이므로 I-3에서 형식 조정이 생길 수 있다.
