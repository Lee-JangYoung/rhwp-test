# 프로필 파일 레퍼런스 (v1)

> 이 문서는 `packages/core`의 가이드 생성기에서 **자동 생성**한다(`pnpm --filter @yangsik/core gen:docs`). 직접 고치지 않는다. 설계 배경은 [doctype-profile.md](doctype-profile.md).

## 최소 프로필 예 (유스케이스 명세서)

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
        map:
          UC ID: '{id}'
          유스케이스명: '{name}'
          기본 흐름: { from: main, format: numbered }
          대안 흐름: { from: alt, format: numbered }
          '*': fields
      - { kind: diagrams, from: diagrams }
```

## 파일 구성과 키

프로필은 문서 유형 폴더(`templates/<유형>/`)의 `profile.yaml`이다. 같은 폴더에 양식(`template`), md 규약(`schema`), 예제를 둔다. 경로는 프로필 폴더 기준 상대 경로다.

| 키 | 종류 | 필수 | 설명 |
|---|---|---|---|
| `version` | 상수(1) | 필수 | 프로필 형식 버전 |
| `type` | string | 필수 | 문서 유형 이름(예: usecase) |
| `name` | string | 선택 | 사람이 읽는 이름(선택) |
| `template` | string | 필수 | 양식 파일(HWPX). 프로필 폴더 기준 상대 경로 |
| `schema` | string | 선택 | md 규약 JSON Schema 파일. 프로필 폴더 기준 상대 경로(선택) |
| `md` | object | 필수 | md를 이름 붙은 데이터로 읽는 규칙 |
| `md.frontMatter` | string | 선택 | front-matter를 가리킬 데이터 이름(예: meta). 경로는 meta.title처럼 쓴다 |
| `md.collections` | object | 필수 | 컬렉션 이름 → 정의 |
| `md.collections.<이름>` | object | 선택 | 반복되는 md 구조(예: 항목 제목 하나) |
| `md.collections.<이름>.heading` | object | 필수 | 컬렉션 항목을 나누는 제목 |
| `md.collections.<이름>.heading.level` | integer | 필수 | 제목 수준(1~6) |
| `md.collections.<이름>.heading.pattern` | string | 필수 | 제목 텍스트 패턴. 자리표시자로 캡처한다. 예: '{id} {name}' |
| `md.collections.<이름>.slots` | array | 선택 | 항목 안에서 읽을 내용(위에서부터) |
| `md.collections.<이름>.slots[]` | object | 선택 | 항목 안에서 읽을 내용 |
| `md.collections.<이름>.slots[].as` | enum(kv / records / list / text / code / table) | 필수 | 읽는 방식: kv=키-값 표, records=목록형 표(행 레코드), list=목록, text=서술 문단, code=코드 블록, table=표 원형 |
| `md.collections.<이름>.slots[].key` | string | 필수 | 데이터 이름(바인딩의 경로에서 쓴다) |
| `md.collections.<이름>.slots[].under` | string | 선택 | 이 제목 아래의 내용만 읽는다(하위 제목 텍스트) |
| `md.collections.<이름>.slots[].optional` | boolean | 선택 | 없어도 규약 위반이 아님(기본 false, code 슬롯은 true) |
| `md.collections.<이름>.slots[].lang` | string | 선택 | as가 code일 때 코드 블록 언어(예: mermaid) |
| `md.collections.<이름>.children` | object | 선택 | 하위 컬렉션(이름 → 컬렉션) |
| `md.collections.<이름>.children.<이름>` | object | 선택 | 반복되는 md 구조(예: 항목 제목 하나) |
| `bindings` | array | 필수 | 양식 위치 × 데이터 × 동작의 목록 |
| `output` | object | 선택 | 출력 옵션(생략 가능) |
| `output.tablePageBreak` | enum(none / table / cell) | 선택 | 복제한 표의 쪽 경계 나눔 (기본 "cell") |
| `output.fitHeights` | boolean | 선택 | 채운 뒤 표 높이를 렌더 높이로 맞춤 (기본 true) |
| `output.diagram` | object | 선택 |  |
| `output.diagram.maxWidthHu` | integer | 선택 | 그림 최대 폭(HWPUNIT) (기본 40000) |
| `output.diagram.scale` | integer | 선택 | 다이어그램 렌더 배율 (기본 2) |
| `policy` | object | 선택 | 위반 시 동작(생략하면 모두 error) |
| `policy.onMissingLabel` | enum(error / warn / ignore) | 선택 | 매핑한 라벨·위치가 양식에 없을 때 (기본 "error") |
| `policy.onMissingField` | enum(error / warn / ignore) | 선택 | 매핑한 누름틀이 양식에 없을 때 (기본 "error") |
| `policy.onMissingRenderer` | enum(error / warn / ignore) | 선택 | 다이어그램 렌더러가 없을 때 (기본 "error") |
| `policy.onUnmappedData` | enum(error / warn / ignore) | 선택 | md에 있으나 어디에도 쓰이지 않은 데이터 (기본 "warn") |

`bindings`의 항목은 아래 kind별 표를 따른다.

## 동작(kind)

### fields — 사용 가능

양식의 누름틀에 값을 채운다. 표지·문서 정보에 쓴다.

| 키 | 종류 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | 선택 | 바인딩 이름(선택). 오류 메시지와 대화에서 가리키는 용도 |
| `map` | object | 필수 | md 데이터 경로 → 양식 누름틀 이름 |

### cells — 사용 가능

표에서 라벨 셀 옆(오른쪽 또는 아래) 값 셀에 단일 값을 채운다. 항목 헤더 표에 쓴다.

| 키 | 종류 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | 선택 | 바인딩 이름(선택). 오류 메시지와 대화에서 가리키는 용도 |
| `in` | locator | 선택 | 값을 채울 표의 위치. 생략하면 바깥 repeat의 단위(표) 자체 |
| `labelColumn` | integer | 선택 | 라벨이 있는 열(0부터) (기본 0) |
| `valueColumn` | integer | 선택 | 값 셀이 있는 열(0부터). value가 right일 때 (기본 1) |
| `value` | enum(right / below) | 선택 | 값 셀의 위치: 라벨의 오른쪽 또는 아래 (기본 "right") |
| `map` | object | 필수 | 양식 라벨 → 값. 키 '*'는 값 슬롯(kv)의 나머지 항목을 같은 이름의 라벨로 채운다 |
| `unmappedValue` | enum(clear / keep) | 선택 | 값이 없는 라벨: clear=양식 안내 문구를 비움, keep=그대로 둠 (기본 "clear") |

### repeat — 사용 가능

컬렉션의 항목 수만큼 양식 영역(표 하나, 또는 range로 시작~끝 표 묶음)을 복제하고, 복제본마다 do를 실행한다. 중첩할 수 있다(안쪽 unit은 바깥 복제본 안의 표에서 찾는다).

| 키 | 종류 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | 선택 | 바인딩 이름(선택). 오류 메시지와 대화에서 가리키는 용도 |
| `over` | string | 필수 | 반복할 md 컬렉션 이름(md.collections의 키, 또는 바깥 항목의 하위 컬렉션) |
| `unit` | locator | 필수 | 복제할 양식 영역의 위치. 지원: { table: ... } 또는 { range: { start: {table}, end: {table} } } |
| `onEmpty` | enum(error / remove / keep) | 선택 | 항목이 없을 때: error=오류, remove=영역(표)을 삭제, keep=그대로 (기본 "error") |
| `do` | array | 필수 | 복제본마다 실행할 바인딩(이 안의 경로는 그 항목 기준) |

### diagrams — 사용 가능

코드 블록(mermaid)을 이미지로 렌더해 단위 뒤에 삽입한다.

| 키 | 종류 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | 선택 | 바인딩 이름(선택). 오류 메시지와 대화에서 가리키는 용도 |
| `from` | string | 필수 | 다이어그램 코드를 담은 code 슬롯의 키 |
| `place` | enum(afterUnit / atMarker) | 선택 | 삽입 위치: afterUnit=복제된 단위 바로 뒤, atMarker=at 위치(미지원) (기본 "afterUnit") |
| `at` | locator | 선택 | place가 atMarker일 때의 위치 |

### rows — 사용 가능

표의 견본 행을 레코드 수만큼 복제해 열마다 값을 채운다(속성·메서드·컬럼 정의·개정이력). 값 표기는 cells.map과 같고 레코드의 키는 md 표의 머리글, 행 번호는 {#}.

| 키 | 종류 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | 선택 | 바인딩 이름(선택). 오류 메시지와 대화에서 가리키는 용도 |
| `in` | locator | 선택 | 행을 반복할 표의 위치. 생략하면 바깥 repeat의 단위(표 하나일 때) |
| `headerRows` | integer | 선택 | 머리행 수. 열 머리글은 그 마지막 머리행에서 찾는다 (기본 1) |
| `templateRow` | integer | 선택 | 견본으로 쓸 데이터 행(머리행 다음 0부터) (기본 0) |
| `over` | string | 필수 | 레코드 목록의 경로: records 슬롯(md 표의 행) 또는 컬렉션(항목마다 한 행) |
| `columns` | object | 필수 | 양식 열 머리글 → 값 표기. 레코드의 값은 '{이름}'처럼 md 표 머리글로, 행 번호는 '{#}' |
| `onEmpty` | enum(clear / keep / removeRow / error) | 선택 | 레코드가 없을 때: clear=견본 행을 비움, keep=그대로, removeRow=견본 행 삭제, error=오류 (기본 "clear") |
| `unmappedValue` | enum(clear / keep) | 선택 | columns에 없는 열: clear=견본 행의 안내 문구를 비움, keep=그대로 둠 (기본 "clear") |

### paragraphs — 사용 가능

본문 문단(표식 텍스트가 든 문단)을 front-matter의 목록·서술 값으로 바꾼다. 줄마다 같은 서식의 문단이 이어진다. repeat 안에서는 쓸 수 없다(문단은 복제하지 않는다).

| 키 | 종류 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | 선택 | 바인딩 이름(선택). 오류 메시지와 대화에서 가리키는 용도 |
| `at` | locator | 필수 | 바꿀 문단의 위치. 지원: { paragraph: { text: '표식' } } (그 텍스트가 든 첫 본문 문단) |
| `from` | string | 필수 | front-matter 값의 경로(예: meta.notes). 목록이면 항목마다 한 문단, 문자열이면 줄마다 한 문단 |
| `format` | enum(plain / numbered / bulleted / lines / join) | 선택 | 표기 형식 (기본 "plain") |
| `onEmpty` | enum(clear / keep / error) | 선택 | 값이 없을 때: clear=문단을 비움, keep=그대로, error=오류 (기본 "clear") |

### remove — 사용 가능

조건에 따라 행(표의 0열 라벨 기준) 또는 표를 삭제한다(선택 항목이 없을 때). 조건: empty(경로) 또는 exists(경로). cells로 채운 뒤에 둔다.

| 키 | 종류 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | 선택 | 바인딩 이름(선택). 오류 메시지와 대화에서 가리키는 용도 |
| `in` | locator | 선택 | target이 row일 때 그 행이 있는 표. 생략하면 바깥 repeat의 단위(표 하나일 때) |
| `target` | locator | 필수 | 삭제할 영역: { row: { label } } 또는 { table: ... } |
| `when` | string | 필수 | 조건: empty(경로) 또는 exists(경로) |

### text — 사용 가능

본문·표 셀 안의 토큰({{이름}})을 값으로 바꾼다. 문서 전체에 적용되므로 repeat 밖에서만 쓴다. 누름틀이 없는 양식에 쓴다.

| 키 | 종류 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | 선택 | 바인딩 이름(선택). 오류 메시지와 대화에서 가리키는 용도 |
| `map` | object | 필수 | 토큰 이름 → 값 표기. 양식의 '{{이름}}'이 값으로 바뀐다 |

## 양식 위치 지정 (키 하나만 쓴다)

| 위치 | 의미 | 상태 |
|---|---|---|
| `{ table: { label: X } }` | 0열에 라벨 X가 있는 표 | 사용 가능 |
| `{ table: { headerLabel: X } }` | 첫 행에 X가 있는 표 | 사용 가능 |
| `{ table: { index: n } }` | 문서에서 n번째 표(0부터) | 사용 가능 |
| `{ table: { text: X } }` | 표 안에 X가 들어 있는 표 | 사용 가능 |
| `{ range: { start: {table}, end: {table} } }` | 시작 표~끝 표 사이의 표 전부 | repeat.unit에서 사용 가능 |
| `{ paragraph: { text / style / bookmark } }` | 문단 | 아직 지원하지 않음 |
| `{ row: { label: X } }` | 표 안의 행 | 아직 지원하지 않음 |
| `{ field: X }`, `{ bookmark: X }` | 누름틀, 책갈피 | 아직 지원하지 않음 |

표 안의 라벨·머리글은 `analyzeTemplate`의 `tables[].labels`, `header`에 있는 텍스트를 **공백·철자까지 그대로** 쓴다.

## 데이터 경로와 값 표기

- 경로는 점 표기다. 바깥에서는 `md.frontMatter`로 정한 이름(예: `meta.title`)과 `md.collections`의 이름만 쓸 수 있다.
- `repeat` 안(`do`)에서는 그 항목 기준이다: 제목 패턴에서 캡처한 이름(`'{id} {name}'` → `id`, `name`), 슬롯의 `key`, 하위 컬렉션 이름.
- `kv` 슬롯은 `fields.액터`처럼 하위 키를 쓸 수 있다. 다른 슬롯은 하위 경로가 없다.
- 값 표기: 자리표시자 문자열 `'{id}'` 또는 `{ from: 경로, format, default }`. format: plain · numbered · bulleted · lines · join.
- `cells.map`의 키 `'*'`는 kv 슬롯의 나머지 항목을 같은 이름의 라벨로 채운다.

## 오류 코드와 고치는 법

| code | 의미 | 고치는 법 |
|---|---|---|
| `yaml-syntax` | YAML 문법 오류 | 들여쓰기·따옴표·콜론 뒤 공백을 확인한다. `{id} {name}`처럼 중괄호로 시작하는 값은 따옴표로 감싼다. |
| `unknown-key` | 알 수 없는 키 | 후보(candidates) 중 맞는 키로 고친다. 형식에 없는 키는 쓸 수 없다. |
| `missing-key` | 필수 키 누락 | 해당 위치에 필수 키를 추가한다. 필수 키는 가이드의 kind별 키 표에서 확인한다. |
| `invalid-type` | 값의 종류가 다름 | 기대한 종류(문자열·숫자·목록·객체)로 고친다. |
| `invalid-value` | 허용되지 않는 값 | 후보(candidates) 중 하나로 고친다. |
| `unknown-kind` | 등록되지 않은 kind | `describeKinds()`가 알려 주는 kind만 쓴다. |
| `kind-not-supported` | 정의만 되어 아직 지원하지 않는 kind·위치 지정 | 지원하는 kind(`describeKinds()`)로 표현하거나, 검증이 끝나 활성화될 때까지 쓰지 않는다. |
| `field-not-found` | 양식에 없는 누름틀 이름 | 양식 분석(`analyzeTemplate`)의 fields에 있는 이름만 쓴다. |
| `table-not-found` | 양식에서 위치 지정에 맞는 표가 없음 | 양식 분석의 표 목록(labels, header)을 보고 위치 지정을 고친다. |
| `table-ambiguous` | 위치 지정에 맞는 표가 여러 개 | 더 구체적인 위치 지정(다른 label·headerLabel·index)을 쓴다. |
| `token-not-found` | 양식에 없는 치환 토큰({{이름}}) | 양식 분석의 tokens에 있는 이름만 쓴다. |
| `paragraph-not-found` | 양식에 없는 문단 | 양식 분석의 paragraphs에 있는 문단 텍스트(표식)를 그대로 쓴다. |
| `yaml-ambiguous-key` | YAML이 문자열이 아닌 값(null·true·숫자)으로 읽는 키 | 양식 라벨이 NULL·Yes·No·숫자처럼 보이면 따옴표로 감싼다(예: 'NULL': '{NULL}'). |
| `range-invalid` | range(표 묶음)의 시작·끝이 맞지 않음 | 시작 표가 끝 표보다 앞에 오도록 하고, 둘 다 같은 문맥(바깥 repeat 단위) 안의 표로 지정한다. |
| `locator-required` | 양식 위치 지정이 필요함 | `in`으로 표를 지정하거나, repeat의 do 안에서 쓴다. |
| `label-not-found` | 표에 없는 라벨 | 표의 라벨 열(labels)에 있는 텍스트를 그대로 쓴다. 공백·철자까지 같아야 한다. |
| `path-unknown` | md 데이터 경로를 찾을 수 없음 | `md` 절에서 선언한 컬렉션·슬롯·캡처 이름만 쓴다. 후보를 확인한다. |
| `collection-unknown` | 선언하지 않은 컬렉션 | `md.collections`에 선언한 이름을 `over`에 쓴다. |
| `slot-type-mismatch` | 슬롯 종류가 이 용도와 맞지 않음 | 용도에 맞는 슬롯(예: diagrams는 code 슬롯)을 가리킨다. |
| `slot-unused` | md에서 읽지만 어디에도 쓰이지 않는 슬롯 | 의도한 것이면 둔다. 아니면 바인딩에 연결하거나 슬롯을 지운다. |
| `label-unmapped` | 양식 라벨이 매핑되지 않음 | 값을 넣어야 하면 map에 추가한다. 비워도 되면 둔다(unmappedValue에 따라 비워진다). |
| `file-not-found` | 프로필이 가리키는 파일이 없음 | template·schema 경로(프로필 폴더 기준 상대 경로)를 확인한다. |
| `name-conflict` | 같은 컬렉션 안에서 캡처·슬롯·하위 컬렉션 이름이 겹침 | 이름이 서로 다르게 고친다(제목 패턴의 {이름}, 슬롯 key, children 이름). |
| `collection-empty` | 반복할 항목이 없음(변환 중 확인) | md에 항목을 추가하거나, 없어도 되면 repeat의 onEmpty를 keep으로 한다. |
| `renderer-missing` | 다이어그램 렌더러가 없음(변환 중 확인) | 렌더러를 연결하거나 policy.onMissingRenderer를 warn/ignore로 한다. |
| `schema-required-unmapped` | md 규약의 필수 항목이 양식에 채워지지 않을 수 있음 | cells.map에 해당 라벨을 추가하거나 '*'를 쓰고, 양식의 라벨에 있는지 확인한다. |
| `binding-empty` | 바인딩이 하는 일이 없음 | map·columns 등 동작 내용을 채운다. |

각 오류에는 `path`(프로필 안 위치), `line`, `candidates`(가까운 후보)가 있다. 후보가 있으면 그중에서 고른다.
