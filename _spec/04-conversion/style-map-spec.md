# 양식과 style-map.yaml

결정: [ADR-0002](../adr/0002-template-file-based-styling.md) — 양식은 한글에서 만든 HWP/HWPX 파일을 그대로 열어 쓰고, Markdown 요소와 양식 스타일의 연결만 `style-map.yaml`로 선언한다. **스키마는 가설이며 스파이크(S-01, S-03, S-10) 후 확정한다.**

```yaml
version: 1
template:
  path: templates/report.hwpx
  contentStart: 본문시작        # 본문 삽입 위치(책갈피). 없으면 문서 끝
styles:                          # Markdown 요소 → 양식에 존재하는 스타일 이름
  heading1: 개요 1
  heading2: 개요 2
  body: 바탕글
  caption: 캡션
  tableHeader: 표머리
  tableCell: 표내용
fields:                          # front-matter 키 → 양식 누름틀 이름
  title: 제목
  author: 기안자
  date: 기안일
output:
  defaultFormat: hwpx            # hwp | hwpx
```

## 양식 요구 사항
- 쪽 설정, 머리말/꼬리말, 쪽번호, 표지는 양식에서 정의한다.
- `styles` 값은 양식의 스타일 이름과 **정확히 일치**해야 하고, 값이 바뀌는 곳은 누름틀로 만들어 `fields` 값과 일치시킨다.
- 변환 시작 시 `getStyleList()`·`getFieldList()`와 대조해 없는 항목은 경고한다(`--strict`는 중단). 없는 스타일은 `body`로 대체한다.
- 개인정보가 있는 양식은 커밋하지 않고 공개 가능한 샘플만 `templates/`에 둔다.
