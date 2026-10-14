# 웹 UI

요구: FR-18, FR-19

## 목적
설치 없이 브라우저에서 Markdown을 양식에 맞춰 HWP/HWPX로 변환하고 결과를 확인한다. 변환은 **브라우저 안에서** 수행한다(문서가 서버로 전송되지 않음).

## 화면 흐름

```
[입력]  md 업로드 / 붙여넣기 / 편집기
   │
[설정]  양식 선택(내장 샘플 또는 업로드) · style-map 선택 · 출력 포맷(HWP/HWPX)
   │
[변환]  진행 상태 + 경고 목록
   │
[결과]  페이지 미리보기(SVG) · 리포트 · 다운로드
         └ (선택) @rhwp/editor로 열어 수정 후 내보내기
```

## 구성

| 영역 | 내용 |
|---|---|
| 좌측 | Markdown 편집기(텍스트 영역으로 시작, 후에 CodeMirror 검토) |
| 중앙 | 변환 결과 페이지 미리보기(`renderPageSvg`를 페이지별 표시) |
| 우측 | 설정, 경고/리포트, 양식 정보(스타일·필드 목록) |

## 기술 사항
- 번들: Vite. `rhwp_bg.wasm`은 정적 자산으로 서빙하고 `init({ module_or_path })`로 로드.
- `measureTextWidth`는 Canvas 2D `measureText`(폰트 문자열 캐시 포함).
- 큰 문서는 Web Worker에서 변환해 UI 차단을 막는다. Worker에는 `OffscreenCanvas`가 필요하므로 지원 여부를 확인한다 [검증 필요].
- Mermaid는 브라우저에서 렌더 후 PNG로 변환(mermaid.md).
- 양식은 내장 샘플과 사용자 업로드 두 가지를 지원하고, 업로드한 양식·문서는 저장하지 않는다.
- 미리보기 편집이 필요하면 `@rhwp/editor`의 `createStudio`를 사용한다. 기본 `studioUrl`이 외부(GitHub Pages)이므로 폐쇄망에서는 자체 호스팅 URL을 지정한다.

## 접근성·보안
- 업로드 파일은 크기 상한을 둔다(예: md 5MB, 이미지 20MB).
- 마크다운 내 원시 HTML은 렌더/삽입하지 않는다.
- 미리보기 SVG를 DOM에 넣을 때 sanitize한다(`innerHTML` 직접 삽입 금지).
