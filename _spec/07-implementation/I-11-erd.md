# I-11 ERD → PNG (2차)

상태: **계획(승인 대기)**. 결정: [ADR-0019](../adr/0019-multi-format-output.md). 개발자 결정: 입력은 md 관계 열과 mermaid `erDiagram` 둘 다, 그리기는 Canvas 2D 공용 코드 + Node `@napi-rs/canvas`.

## 목표
DB 명세서 md의 테이블·컬럼·관계로 ERD를 직접 그려 PNG로 내고, 같은 PNG를 HWPX 문서의 그림으로도 넣는다.

## 설계 개요
- `@yangsik/erd`: ERD 모델(엔티티·컬럼·키·관계) ← (a) 프로필의 `erd` 설정이 읽는 데이터 트리(컬럼 표에 `키`·`참조` 열) (b) mermaid `erDiagram` 파서. 계층/격자 배치, Canvas 2D 그리기(테이블 박스, PK/FK, 관계선, 까마귀발 표기), 간략 모드(키 컬럼만), 글꼴 등록(`--font`, 한글 글꼴 없으면 경고).
- Node 렌더는 `@napi-rs/canvas` 1.0.11(MIT), 브라우저는 같은 그리기 코드를 쓴다.
- 통합: CLI `yangsik erd`, MCP `render_erd`, 웹 미리보기·PNG 저장, HWPX의 표식 문단(`{{ERD}}`)에 그림을 넣는 `image` kind.
- 점검: 참조 대상(테이블·컬럼) 존재, 순환·고립 보고. 시험: 같은 입력 → 같은 PNG 해시, md 두 입력 경로, 글꼴.

세부(열 이름, 배치 알고리즘, 색·크기)는 착수 시 이 문서에 확정해 승인받는다.
