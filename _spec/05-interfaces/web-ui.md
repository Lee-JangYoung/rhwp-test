# 웹 UI (가설)

변환은 **브라우저 안에서** 수행한다(문서를 서버로 보내지 않음).

흐름: md 입력(업로드/붙여넣기) → 양식·포맷 선택 → 변환(경고 표시) → 페이지 SVG 미리보기 → HWP/HWPX 다운로드. 필요하면 `@rhwp/editor`로 열어 수정 후 내보낸다.

기술 사항
- Vite 번들, `rhwp_bg.wasm`은 정적 자산으로 서빙, `measureTextWidth`는 Canvas 2D.
- 큰 문서는 Web Worker에서 변환 — `OffscreenCanvas`에서 폭 측정이 되는지 확인 필요 [검증 필요 S-13].
- `@rhwp/editor` 기본 `studioUrl`이 외부(GitHub Pages)이므로 폐쇄망이면 자체 호스팅 URL을 지정한다.
- 미리보기 SVG는 sanitize 후 DOM에 넣고(`innerHTML` 직접 삽입 금지), 업로드 크기 상한을 둔다. 원시 HTML은 삽입하지 않는다.
