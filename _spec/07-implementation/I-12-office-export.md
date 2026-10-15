# I-12 Office 출력: DOCX·XLSX·PPTX (3차)

상태: **계획(승인 대기)**. 결정: [ADR-0019](../adr/0019-multi-format-output.md). 개발자 결정: 코드 생성을 먼저, 양식 기반 채우기는 후속.

## 목표
md 데이터 트리(컬렉션·슬롯)에서 docx·xlsx·pptx를 새로 만든다. 스타일은 프로필의 `output` 설정으로 조정한다.

## 설계 개요
- `@yangsik/export`: `docx` 9.11.0, `exceljs` 4.4.0, `pptxgenjs` 4.0.1(모두 MIT, 정확히 고정). 환경 중립(바이트 반환).
- 기본 대응
  - DOCX: 항목마다 제목, kv → 2열 표, records → 표, 목록 → 번호 목록, 문단, 다이어그램·ERD → 그림
  - XLSX: 개요 시트(front-matter), 항목마다 시트(kv 위, records 아래 표), 목차 시트
  - PPTX: 표지, 항목마다 한 장(kv 표·목록), 다이어그램·ERD 그림 슬라이드
- 통합: `convert --format hwpx,docx,xlsx,pptx`, MCP `formats`, 웹 다운로드.
- 검증: 생성 파일을 라이브러리로 다시 읽어 시트·표·슬라이드 수와 값을 비교, LibreOffice(`soffice`)로 PDF 변환 확인(이 환경에 설치됨). MS Office 열림은 사람이 확인.

세부 매핑·스타일 키는 착수 시 확정해 승인받는다.
