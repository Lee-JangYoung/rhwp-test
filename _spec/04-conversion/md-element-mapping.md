# Markdown → HWP 요소 매핑

> 이 문서는 변환 동작의 단일 출처(SSOT)다. "방법" 열의 API는 후보이며 스파이크로 확정한다.

| Markdown | IR | HWP 결과 | 스타일 키 | 후보 API | 요구 |
|---|---|---|---|---|---|
| `# ~ ######` | heading | 개요 문단 | `heading1`~`heading6` | `insertParagraph`+`insertText`+`applyStyle` | FR-02 |
| 문단 | paragraph | 본문 문단 | `body` | 동일 | FR-03 |
| `**굵게**` | marks:bold | 글자 굵게 | (서식) | `applyCharFormat` | FR-03 |
| `*기울임*` | marks:italic | 글자 기울임 | (서식) | `applyCharFormat` | FR-03 |
| `~~취소선~~` | marks:strike | 취소선 | (서식) | `applyCharFormat` | FR-03 |
| `` `코드` `` | marks:code | 글꼴 변경 | `inlineCode` 또는 서식 | `applyCharFormat` | FR-03 |
| 비순서 목록 | list | 글머리표 문단 | `bullet1`~`bullet3` | 번호/글머리 API 또는 스타일 | FR-04 |
| 순서 목록 | list | 번호 문단 | `number1`~`number3` | `createNumbering` 등 | FR-04 |
| 표 | table | 표 + 머리행 | `table`, `tableHeader`, `tableCell` | `createTable(Ex)`+`insertTextInCell` | FR-05 |
| 이미지 | image | 그림(+캡션) | `figure`, `caption` | `insertPictureEx` | FR-06 |
| `> 인용` | quote | 인용 문단 | `quote` | `applyStyle` | FR-07 |
| 코드펜스 | code | 고정폭 문단(줄 단위) | `codeBlock` | `applyStyle` | FR-07 |
| `[^1]` | footnote | 각주 | `footnote` | `insertFootnote` | FR-08 |
| `$$ … $$` | math | 수식 또는 이미지 | `equation` | `insertEquation` / 이미지 | FR-09 |
| ```` ```mermaid ```` | diagram | 그림 + 캡션 | `figure`, `caption` | 이미지 렌더 후 `insertPictureEx` | FR-10 |
| `<!-- hwp:pagebreak -->` | pagebreak | 쪽 나눔 | - | `insertPageBreak` | FR-15 |
| `<!-- hwp:toc -->` | toc | 목차 | `toc` | [검증 필요] | FR-15 |
| 링크 | link | 하이퍼링크 | - | `insertHyperlinkEx` | |
| 수평선 `---` | (미지원) | 경고 후 무시 | - | - | |
| 원시 HTML | (미지원) | 경고 후 무시 | - | - | |

## 처리 규칙

1. **스타일 우선**: 서식은 가능하면 양식의 스타일 이름으로 표현하고, 스타일이 없는 인라인 효과만 글자 서식으로 처리한다.
2. **중첩 목록**: 3단계까지 지원하고 이후는 3단계로 평탄화하며 경고한다.
3. **표**: 머리행은 첫 행. 열 정렬은 문단 정렬로 반영. 열 너비는 글자 수 비례(상한/하한 적용) 또는 front-matter/속성으로 지정. 병합 셀은 지원하지 않는다(C).
4. **이미지**: 본문 폭을 넘으면 비율을 유지해 축소한다. 지원하지 않는 확장자는 경고 후 대체 문구를 넣는다.
5. **코드블록**: 줄바꿈을 유지하며 긴 줄은 자동 줄바꿈에 맡긴다. 구문 강조는 하지 않는다.
6. **미지원 요소**: 실패시키지 않고 리포트 경고에 기록한다. `--strict`에서는 오류로 처리한다.
7. **front-matter**: `fields` 매핑에 따라 양식 필드에 채우고, 본문에는 출력하지 않는다.
