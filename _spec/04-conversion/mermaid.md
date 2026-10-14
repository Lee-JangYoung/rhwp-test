# 다이어그램(Mermaid)

결정: [ADR-0004](../adr/0004-mermaid-prerender-to-image.md) — HWP에 Mermaid 개념이 없으므로 **이미지로 렌더링해 일반 그림으로 삽입**한다.

```text
mermaid 코드펜스 → diagram(IR) → 렌더러 → PNG → asset → insertPictureEx
```

| 환경 | 렌더러 |
|---|---|
| CLI | `@mermaid-js/mermaid-cli` (Chromium 필요) |
| 웹 | 브라우저 mermaid → Canvas로 PNG 변환 |
| 대안 | 미리 만든 이미지를 `![](diagram.png)`로 참조 |

- PNG 기본, SVG 삽입 가능 여부는 S-04로 확인. 배경은 흰색, 2배 해상도로 렌더 후 본문 폭에 맞춰 축소.
- 렌더 실패(문법 오류·렌더러 없음)는 원문 코드블록으로 대체하고 경고한다(`--strict`는 중단).
- 한계: 삽입된 그림은 한글에서 편집할 수 없다(원본은 md에 남는다).
