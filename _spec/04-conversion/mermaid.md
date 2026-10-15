# 다이어그램(Mermaid)

결정: [ADR-0004](../adr/0004-mermaid-prerender-to-image.md) — HWPX에 Mermaid 개념이 없으므로 **이미지로 렌더링해 일반 그림으로 삽입**한다.

```text
mermaid 코드 슬롯(code) → 렌더러(주입) → PNG → insertImageAfter(insertPictureEx)
```

## 시험 결과 (2026-10-14)
- `@mermaid-js/mermaid-cli` + 시스템 Chromium(`--no-sandbox`)으로 시퀀스·ER 다이어그램을 PNG로 렌더 — 다이어그램당 약 3초(`scale 2`, 900×610px), **한글 레이블 정상**.
- PNG → `insertPictureEx` → HWP·HWPX 저장 → 재로드에서 그림 유지, `renderPageSvg`에 `<image>` 포함 (S-04 부분).

| 환경 | 렌더러 |
|---|---|
| CLI/MCP | mermaid-cli (Chromium 필요) |
| 웹(후순위) | 브라우저 mermaid → Canvas로 PNG 변환 |
| 대안 | 미리 만든 이미지를 `![](diagram.png)`로 참조 |

## 방침
- PNG 기본(SVG 삽입은 미검증). 배경은 흰색, 2배 해상도로 렌더 후 본문 폭에 맞춰 종횡비를 유지해 삽입한다.
- **렌더 환경을 고정**한다(Chromium과 한글 글꼴 포함). 결과는 `해시(소스+테마+mermaid 버전)`로 캐시한다. 결정성은 미검증 [검증 필요 S-16].
- 렌더 실패(문법 오류·렌더러 없음)는 원문 코드블록으로 대체하고 경고한다(`--strict`는 중단).
- **격리(S-29)**: Node 렌더러는 mermaid `securityLevel: strict`, 외부 요청 차단(죽은 SOCKS 프록시 + loopback만 예외), 해시로 만든 안전한 파일명, 호출마다 별도 임시 폴더를 쓴다. 로컬 서버로 확인한 외부 요청은 0건.
- 한계: 삽입된 그림은 한글에서 편집할 수 없다(원본은 md에 남는다). 큰 이미지의 쪽 넘김과 한컴 표시는 미검증.
