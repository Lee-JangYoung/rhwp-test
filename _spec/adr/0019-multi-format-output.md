# ADR-0019: 출력 포맷을 HWPX 밖으로 확장한다 (HWP 5.0 → ERD PNG → Office)

- 상태: 채택 (개발자 요청 2026-10-15). [ADR-0010](0010-hwpx-first-output.md)의 "HWP 5.0·Excel·DOCX 후순위"를 **부분 대체**한다(HWPX가 기준 출력이라는 점은 유지).
- 날짜: 2026-10-15

## 배경
개발자 요구: Markdown으로 만든 산출물을 여러 포맷으로 낸다. 1차 hwp, 2차 ERD(html canvas → png), 3차 docx·excel·ppt 등 office. ADR-0010 당시에는 HWPX만 검증했다.

## 결정
- **포맷 어댑터를 둔다.** 변환 코어가 만드는 데이터(md 데이터 트리, 변환된 문서 세션)에서 포맷별 출력을 만들고, 각 출력은 **자체 검증**을 가진다. 변환 경로는 계속 LLM 없음.
- 두 종류로 나눈다.
  1. **엔진 파생**: 같은 rhwp 세션에서 저장 포맷만 바꾼다(HWP 5.0: `exportHwp`). 내용·서식이 HWPX와 같아야 하므로 HWPX 재로드와 구조를 비교해 검증한다.
  2. **모델 파생**: rhwp 없이 md 데이터 트리에서 만든다(ERD PNG, DOCX·XLSX·PPTX). 양식(템플릿) 충실도가 아니라 내용 충실도를 검증한다.
- **순서**: I-10 HWP 5.0 → I-11 ERD PNG → I-12 Office(코드 생성). 개발자 결정(2026-10-15): ERD 입력은 md 관계 열과 mermaid `erDiagram` 둘 다, 그리기는 Canvas 2D 공용 코드 + Node의 `@napi-rs/canvas`, Office는 코드 생성을 먼저 하고 양식 기반 채우기는 후속.
- **패키지**: ERD는 `@yangsik/erd`(환경 중립 레이아웃·그리기, Node 렌더는 `/node`), Office는 `@yangsik/export`(환경 중립 바이트 생성). 코어에는 새 무거운 의존을 넣지 않는다. 버전은 정확히 고정한다(ADR-0013).
- 한컴·MS Office에서 열림은 사람이 확인한다(확인 키트에 포맷을 추가). 이 환경에서는 라이브러리 재읽기, rhwp 재로드, LibreOffice 변환으로 대체 검증한다.

## 대안
| 대안 | 단점 |
|---|---|
| HWPX만 유지 | 개발자 요구와 다름 |
| 모든 포맷을 양식 기반으로 | docx·pptx용 템플릿 채움 엔진이 없어 구현이 크게 늘어남(후속) |
| 외부 변환기(LibreOffice 등)로 HWPX→다른 포맷 | 한글 문서 변환 품질·설치 의존이 큼 |

## 결과
단계 계획: [I-10](../07-implementation/I-10-hwp-output.md) · [I-11](../07-implementation/I-11-erd.md) · [I-12](../07-implementation/I-12-office-export.md).
