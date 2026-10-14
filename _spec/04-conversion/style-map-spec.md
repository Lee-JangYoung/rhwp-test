# style-map.yaml 명세 (제안, 스파이크 후 확정)

양식 파일과 Markdown 요소를 연결하는 설정 파일이다. 양식이 바뀌면 이 파일만 교체한다.
관련 결정: [ADR-0002](../adr/0002-template-file-based-styling.md)

## 예시

```yaml
version: 1
name: 기본 보고서

template:
  path: templates/report.hwpx        # 양식 파일 (HWP 또는 HWPX)
  contentStart: bookmark:본문시작     # 본문 삽입 시작 위치 (책갈피) — 없으면 문서 끝

styles:                               # Markdown 요소 → 양식 스타일 이름
  heading1: 개요 1
  heading2: 개요 2
  heading3: 개요 3
  heading4: 개요 4
  body: 바탕글
  bullet1: 글머리표 1
  bullet2: 글머리표 2
  number1: 번호 1
  number2: 번호 2
  quote: 인용
  codeBlock: 코드
  caption: 캡션
  tableHeader: 표머리
  tableCell: 표내용

fields:                               # front-matter 키 → 양식 필드 이름
  title: 제목
  author: 기안자
  date: 기안일
  org: 부서

table:
  widthPolicy: auto                   # auto | equal | explicit
  headerRepeat: true
  borderStyle: 표기본                  # 양식에 정의된 표 스타일/모양 이름 [검증 필요]

image:
  maxWidthMm: 150
  align: center
  captionPosition: below              # below | above | none

fallback:
  missingStyle: body                  # 스타일이 양식에 없을 때 대체 키
  unsupported: warn                   # warn | error

output:
  defaultFormat: hwpx                 # hwp | hwpx
```

## 필드 설명

| 경로 | 필수 | 설명 |
|---|---|---|
| `version` | O | 스키마 버전. 현재 1 |
| `template.path` | O | 양식 파일 경로(맵 파일 기준 상대경로) |
| `template.contentStart` | | 본문 삽입 위치. 책갈피 또는 `end`. 방식은 스파이크 후 확정 |
| `styles.*` | O(heading1, body) | 값은 **양식에 존재하는 스타일 이름**. 변환 시작 시 `getStyleList()`와 대조 |
| `fields.*` | | front-matter 키와 양식 누름틀 이름 |
| `table.*`, `image.*` | | 기본값은 코드에 내장 |
| `fallback.*` | | 오류 처리 정책 |
| `output.defaultFormat` | | CLI `-f`가 우선 |

## 검증 규칙
1. `styles` 값이 양식에 없으면 시작 시 오류 목록을 출력한다(`--strict`는 중단, 기본은 `fallback.missingStyle` 적용).
2. `fields`의 양식 필드가 없으면 경고한다.
3. 알 수 없는 키는 경고한다(오타 방지).
4. JSON Schema를 `packages/core/schema/style-map.schema.json`으로 제공하고 IDE 자동완성에 연결한다.

## 지시 주석 (본문 내)
| 주석 | 의미 |
|---|---|
| `<!-- hwp:pagebreak -->` | 쪽 나눔 |
| `<!-- hwp:toc -->` | 목차 삽입 |
| `<!-- hwp:style 스타일키 -->` | 다음 블록에 한정해 스타일 키 재지정 |
| `<!-- hwp:width 50% -->` | 다음 이미지/표의 폭 |
