# 데이터 모델

변환 코어의 내부 데이터 구조. 별도 중간표현(IR)은 두지 않는다 — md는 프로필의 읽기 규칙으로 곧바로 **데이터 트리**가 되고, 트리와 양식을 잇는 것은 프로필의 바인딩이다([ADR-0016](../adr/0016-profile-format-binding-tree.md)). 과거의 문서 IR(heading·table 블록 등)은 채움형 변환(ADR-0012)으로 바뀌며 폐기됐다.

## 1. md 데이터 트리 (`readMarkdown`)
프로필 `md`의 **컬렉션**(반복되는 제목)과 **슬롯**(항목 안에서 읽을 내용)이 md를 JSON 트리로 만든다. JSON 직렬화 가능, 규약(`schema.json`)은 이 트리에 대한 JSON Schema다.

```
{ <frontMatter>: { 키: 문자열 },                 // YAML failsafe: 숫자·불리언도 문자열 그대로
  <컬렉션>: [ { <제목 캡처>, <슬롯 key>: 값, <하위 컬렉션>: [ … ] } ] }
```

| 슬롯 `as` | 읽는 대상 | 값 |
|---|---|---|
| `kv` | 2열 표(`항목\|내용`) | `{항목: 내용}` |
| `records` | 목록형 표 | `[{열머리글: 값}]` |
| `list` | 번호·글머리 목록 | `string[]` |
| `text` | 서술 문단 | `string` |
| `code` | 코드 블록(`lang`) | `string[]` (예: mermaid) |
| `table` | 표 원형 | 행렬 |

- **엄격 읽기**: 읽지 않는 제목, 슬롯에 없는 코드 블록, 3열 이상 kv는 위반이다([I-9](../07-implementation/I-9-plan-and-strict-md.md)). 위반은 `{line, path, message}`로 md 줄 번호를 가진다.
- `lines`: JSON 포인터 → md 줄. 규약 위반 메시지의 줄 번호에 쓴다.

## 2. 프로필과 계획(`Plan`)
- `Profile`: `md`(컬렉션·슬롯) + `bindings`(양식의 위치 → 데이터 → 동작 kind) + `output` + `policy`. 형식: [doctype-profile.md](../04-conversion/doctype-profile.md), 키 전체: [profile-reference.md](../04-conversion/profile-reference.md).
- `checkProfile`이 양식을 보고 위치 지정을 풀어 **`Plan`**(바인딩 경로 → 문맥 안 표 위치)을 돌려주고 변환은 그것만 쓴다 — 점검과 실행이 같은 표를 가리킨다.
- 실행 중 문맥은 `Unit{slots, all, parent}`: `repeat` 복제본 하나가 가진 표들(양식 순서)과, 안쪽 repeat이 만든 복제 표. 표 위치는 추적 객체(`TRef`)로 관리해 표를 만들거나 지울 때 일괄 보정한다.

## 3. 변환 결과
| 구조 | 내용 |
|---|---|
| `convertBytes` 반환 | `{ bytes(HWPX), hwp?(HWP 5.0), report, previews }` |
| `ConvertReport` | 항목 수, 복제·셀·그림 수, 경고, 프로필 이슈, 쪽 수, `verify`, `hwp?`, 단계별 시간 |
| `VerifyReport` | HWPX를 다시 열어 확인한 항목(`checks[]`), 쪽 수, 컨트롤 개수 |
| `HwpVerifyReport` | HWP를 다시 열어 HWPX 재로드와 비교(`checks[]`), `notes[]`(막지 않는 차이: 쪽 수) — [I-10](../07-implementation/I-10-hwp-output.md) |

향후 포맷 출력(ERD PNG, Office)은 1번의 데이터 트리에서 만든다([ADR-0019](../adr/0019-multi-format-output.md)).
