# Markdown → HWP 매핑

변환 동작의 단일 출처. "후보 API"는 스파이크로 확정한다.

| Markdown | HWP 결과 | 스타일 키 | 후보 API |
|---|---|---|---|
| `#`~`######` | 개요 문단 | `heading1`~`6` | `insertParagraph`+`insertText`+`applyStyle` |
| 문단 | 본문 문단 | `body` | 동일 |
| 굵게/기울임/취소선/인라인코드 | 글자 서식 | (서식) | `applyCharFormat` |
| 목록 | 글머리표/번호 문단 | `bullet1~3`, `number1~3` | 번호 매기기 API 또는 스타일 |
| 표 | 표 + 머리행 | `tableHeader`, `tableCell` | `createTable(Ex)`+`insertTextInCell` |
| 이미지 | 그림 + 캡션 | `caption` | `insertPictureEx` |
| `> 인용` / 코드펜스 | 인용·코드 문단 | `quote`, `codeBlock` | `applyStyle` |
| `[^1]` | 각주 | - | `insertFootnote` |
| `$$..$$` | 수식 또는 이미지 | - | `insertEquation` / 이미지 (미결) |
| ```` ```mermaid ```` | 그림 + 캡션 | `caption` | 이미지 렌더 후 `insertPictureEx` |
| `<!-- hwp:pagebreak -->` | 쪽 나눔 | - | `insertPageBreak` |
| `<!-- hwp:toc -->` | 목차 | - | [검증 필요] |
| 링크 | 하이퍼링크 | - | `insertHyperlinkEx` |
| 원시 HTML, `---` | 무시 + 경고 | - | - |

## 규칙
1. 서식은 가능하면 양식 **스타일 이름**으로, 스타일로 못 하는 인라인 효과만 글자 서식으로 처리한다.
2. 중첩 목록은 3단계까지, 이후는 평탄화하고 경고한다.
3. 표: 첫 행이 머리행, 열 정렬은 문단 정렬로 반영, 셀 병합은 미지원.
4. 이미지: 본문 폭 초과 시 비율 유지 축소. 미지원 확장자는 경고 후 대체 문구.
5. 미지원 요소는 실패시키지 않고 경고로 보고한다(`--strict`는 오류).
6. front-matter는 양식 필드에 채우고 본문에는 출력하지 않는다.
