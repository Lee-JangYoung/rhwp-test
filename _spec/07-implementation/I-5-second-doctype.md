# I-5 두 번째 문서 유형: 행 반복·표 묶음·중첩·삭제

상태: **권장안으로 구현 완료**(개발자 지시: 계획된 기능을 먼저 끝까지 개발하고 평가 후 재설계). 결정은 권장안이며 기능 평가 때 다시 본다. 선행: [I-3](I-3-profile-conversion.md). 형식 배경: [doctype-profile.md](../04-conversion/doctype-profile.md).

## 목표
유스케이스(항목당 표 1개) 밖의 패턴을 프로필만으로 지원하고, **클래스 명세서·DB 명세서(합성 양식)** 로 검증한다. 검증된 것만 `kind` 등록부에서 켠다(ADR-0016).

| 패턴 | 지원 방법 | 비고 |
|---|---|---|
| 항목마다 헤더 표 + 속성 표 + 메서드 표 | `repeat`의 `unit: { range: {start, end} }`(표 묶음 복제) + `cells` + `rows` | 새 위치 지정 `range`(표→표) |
| 표의 행 목록(속성·컬럼·개정이력) | `rows`: 견본 행을 레코드 수만큼 복제하고 열마다 값 채움 | 새로 검증 |
| 항목 안에서 다시 반복(메서드마다 표) | `repeat` 중첩: 안쪽 unit은 바깥 복제본 안에서 찾는다 | 새로 검증 |
| 선택 항목이 없으면 행·표 삭제 | `remove`(`when: empty(경로)\|exists(경로)`, 대상: 행 또는 표) | 새로 검증 |
| 문서 전체가 하나의 목록 표(인터페이스 목록) | 바깥 `rows`(repeat 없이 `in`으로 표 지정) | `rows` 재사용 |

## 설계
- **문맥(scope) 안에서 표 찾기**: `repeat` 안의 `in`·`unit` 위치 지정은 그 복제본의 표들 안에서만 찾는다(복제본마다 라벨이 같으므로 문서 전체 검색은 모호). 바깥(repeat 밖)은 문서 전체. `cells`를 `in` 없이 쓰면 단위 표가 하나일 때 그 표.
- **표 번호 추적**: 표를 만들거나 지울 때 번호가 밀리므로 실행기는 표 위치를 객체로 추적해 일괄 보정한다. 복제본은 **뒤쪽부터** 채운다(안쪽 복제·삭제가 앞쪽 복제본의 위치를 바꾸지 않게). 검증 순서는 표 번호순으로 정렬해 이전 결과와 같다.
- **`range`**: `{ range: { start: {table:…}, end: {table:…} } }` — 문맥 안에서 시작 표부터 끝 표까지의 표 전부(표 사이 문단은 복제하지 않는다. 분석에서 표 사이에 내용 있는 문단이 있으면 경고).
- **`rows`**: `in`(표), `headerRows`(기본 1), `templateRow`(머리행 다음 몇 번째 데이터 행이 견본, 기본 0), `over`(records 슬롯 경로), `columns`(양식 열 머리글 → 값 표기. `cells.map`과 같은 값 표기: `'{이름}'`, `{from, format}`, 행 번호 `'{#}'`), `onEmpty`(`clear` 기본 | `keep` | `removeRow` | `error`), `unmappedValue`(`clear` 기본 | `keep`). 견본 행 뒤에 `insertTableRow`로 n−1행을 추가하고 채운다.
- **`remove`**: `target`: `{ row: {label} }`(문맥 표에서 0열 라벨이 일치하는 행) 또는 `{ table: … }`(표 삭제). `in`으로 행이 속한 표를 지정(기본: 단위 표). `when`: `empty(경로)`·`exists(경로)`. 실행 시점은 바인딩 순서(보통 `cells` 뒤).
- **자체 검증 추가**(rows·remove를 쓴 프로필에 한해): 행 목록 셀 값이 저장 후에도 같은지, 표별 행 수가 저장 전후 같은지.
- **점검 추가**: `rows.columns` 머리글이 양식의 머리행에 있는지(후보 제시), `over`가 records 슬롯인지, `range` 시작/끝이 문맥 안에서 하나로 정해지고 순서가 맞는지, `remove.when` 경로가 존재하는지.
- **실행 중 확인**: `columns`의 레코드 키가 실제 레코드에 없으면 후보와 함께 오류(점검은 md 헤더를 모르므로 실행 때 확인).

## 작업
1. 엔진: `insertRows`·`deleteRow`·`deleteTable`(rhwp `insertTableRow`·`deleteTableRow`·`deleteTableControl`), 스파이크 결과 기록.
2. 실행기 리팩터링(문맥·표 추적·뒤쪽부터), 동작 보존(골든 불변).
3. `rows`·`remove`·`range`·중첩 `repeat` 구현, 점검·가이드·스키마·레퍼런스 갱신.
4. 합성 양식 2종 생성 스크립트와 프로필·예제 md(`templates/class-spec`, `templates/db-spec`), 점검·드라이런·변환 시험.
5. `paragraphs`·`text`: 문단 단위 편집 API를 확인해 단순한 경우가 되면 구현, 아니면 미검증으로 남기고 사유를 기록.
6. 문서: 검증 기록(S-27), known-limitations, 레퍼런스.

## 완료 기준
- 클래스 명세서와 DB 명세서(합성)를 프로필만으로 변환하고 자체 검증이 통과한다. 유스케이스 골든 불변.
- 점검이 LLM 전형 오류(없는 머리글, 잘못된 range, 잘못된 over)를 코드·후보와 함께 잡는다.
- `pnpm check`·CI 통과.

## 결정 사항 (권장안)

| # | 결정 | 권장과 근거 |
|---|---|---|
| D1 | 표 묶음 반복은 새 kind가 아니라 `repeat.unit`의 `range` | 위치 지정은 이미 `range` 자리가 있다. 한 가지 방법으로 둔다 |
| D2 | `rows.columns` 값은 `cells.map`과 같은 값 표기 | 한 가지 표기만 배우면 된다. 행 번호 `'{#}'` |
| D3 | 삭제는 `remove`, 그리고 하위 항목이 없는 경우를 위해 `repeat.onEmpty: remove`도 지원(**구현하며 변경**: 클래스에 메서드가 없는 경우가 흔해 필요) | 선택 하위 항목은 흔하다 |
| D4 | 표 사이 문단은 복제하지 않음 | 합성 양식에서 필요 없음. 실제 양식에서 필요하면 평가 때 재설계 |
| D5 | 뒤쪽 복제본부터 채움 | 안쪽 복제가 앞쪽 위치를 바꾸지 않게 하는 가장 단순한 방법 |

## 구현 결과
- 엔진: `insertRowsAfter`·`deleteRow`·`deleteTable`·`replaceText`·`bodyParagraphs`·`findParagraph`·`setParagraphLines`. 스파이크는 S-27.
- 실행기: 표 위치를 추적 객체로 관리(표를 만들거나 지우면 일괄 보정), 복제본은 뒤쪽부터 채움, 문맥(복제본) 안에서 위치 지정. 유스케이스 골든 불변.
- kind: `rows`·`remove`·`text`·`paragraphs` 검증됨(합성 양식 기준), `repeat.unit`의 `range`·중첩·`onEmpty: remove`. 위치 지정은 `table`(+`range`·`row`·`paragraph.text`).
- 점검 추가: 열 머리글·견본 행·`over` 종류·`range` 순서·바깥 단위 밖의 표·토큰/표식 존재·repeat 안의 `text`/`paragraphs` 거부. 새 오류 코드: `range-invalid`, `token-not-found`, `paragraph-not-found`, `yaml-ambiguous-key`(YAML이 `NULL`·`Yes` 같은 라벨 키를 문자열이 아닌 값으로 읽는 문제 — 시험 중 발견).
- 양식 사실에 `rowsText`(앞 4행), `paragraphs`, `tokens` 추가.
- 산출물: `templates/class-spec`·`db-spec`·`report`(합성 양식, `pnpm --filter @yangsik/core gen:templates`), 프로필(`gen:profiles`: 등록부 상수와 일치를 시험이 지킴), 예제 md·규약. 가이드에 `patterns` 주제 추가. `templates/_examples`는 실제 문서 유형 폴더로 대체되어 삭제.
- 시험(+13): 클래스 명세서(표 묶음·행·중첩·삭제·`{#}`·오류), DB 명세서(행·표 삭제, 행 수 보존), 목록 표(고정 행 보존), text·paragraphs.
- **미검증/이월**: 한컴 열림(S-23), 표 사이 문단 복제(L-20), 항목별 서술 절(문단 복제), 병합 셀이 있는 목록 표·다단 머리행, 실제 SI 양식.
