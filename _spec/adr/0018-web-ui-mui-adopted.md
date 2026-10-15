# ADR-0018: 웹 UI에 MUI를 채택하고 버전을 고정한다

- 상태: 채택 (I-8). [ADR-0014](0014-web-ui-react-mui.md)의 "제안"을 확정하고 측정 결과를 더한다.
- 날짜: 2026-10-15

## 결정
- UI는 React 19 + MUI(`@mui/material` 9.5.0, `@emotion/react` 11.14.0, `@emotion/styled` 11.14.1)로 구현하고 `pnpm-workspace.yaml`의 catalog에서 정확히 고정한다(2026-10-15 npm 최신 안정 버전). 아이콘 패키지는 쓰지 않는다.
- 문서 표시는 계속 `@rhwp/editor`(iframe), 변환·검사·매핑·점검은 브라우저 안에서 `@yangsik/core`로 수행한다(문서를 서버로 보내지 않음. 에디터 자체는 외부 호스팅 스튜디오, L-08·L-18).
- MUI v9는 `Stack`의 시스템 prop(`alignItems`·`flexWrap` 등)을 `sx`로만 받는다.

## 측정 (ADR-0014의 [검증 필요] 해소)
`vite build` 주 번들(`index-*.js`): MUI 적용 전 904.99 kB(gzip 260.81 kB) → 적용 후 1,227.60 kB(gzip 360.69 kB). 증가는 약 323 kB(gzip 약 100 kB). 더 큰 자산은 rhwp WASM(11.8 MB, gzip 4.5 MB)과 Mermaid 청크다. 코드 분할은 하지 않았다(평가 후 결정).

## 결과
- 화면: 상단 문서 유형 선택, 왼쪽(양식·프로필·규약 올리기, md 편집+실시간 규약 검사, 변환·저장·내보내기, 글꼴, 접이식 매핑/보고/프로필 점검), 오른쪽 에디터(양식/결과). 내장 문서 유형은 `templates/*/`를 빌드 때 묶는다.
- 시험(Playwright W1~W9): 기존 시나리오가 그대로 통과(시험용 `data-testid` 유지), 문서 유형 전환·변환·프로필 점검 표시를 추가했다.
