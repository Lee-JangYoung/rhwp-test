# 로드맵

| 단계 | 내용 | 완료 기준 | 상태 |
|---|---|---|---|
| 0 | 양식 확보 (HWPX 저장본, 개인정보 제거) | 스타일·필드·표 구조 확인 | 대기 (실제 양식 없음, 합성 양식으로 대체 시험) |
| 1 | 검증 PoC (보관 브랜치 `archive/poc-final`) | [verification-spike.md](06-quality/verification-spike.md)의 핵심 항목 판정 | **완료**(rhwp 내). 한컴 열림(S-23)은 미확인 |
| 2 | 코어 MVP + rhwp 엔진 (`packages/core`) | 프로필 기반 md → 양식 HWPX, 하드코딩 제거 | **진행 중** — I-0(기반)·I-1(이식)·I-2(프로필 형식) 완료, I-3(프로필 기반 변환) 완료, I-A(LLM 프로필 생성·검토; 실제 모델 호출 미검증)·I-4(CLI)·I-5(두 번째 문서 유형)·I-6(양식 등록 절차·한컴 확인 키트; 한컴 확인은 사람 작업)·I-7(MCP 서버)·I-8(웹 UI, React + MUI) 구현. **계획된 기능 개발 완료, 다음은 기능 평가·재설계**, 단계 계획은 [07-implementation/](07-implementation/) |
| 3 | CLI + MCP + Mermaid | `convert`/`validate`/`analyze`, 에이전트 루프 | 대기 |
| 4 | 웹 UI (React + MUI) | 프로필 선택 → 변환 → 미리보기 → 다운로드 | 후순위 |

```
0 ─▶ 1 ─▶ 2 ─▶ 3 ─▶ 4
```

## 2단계 준비 (작업 목록)
세부 단계(I-0~I-8)와 진행 상태는 [07-implementation/](07-implementation/)가 기준이다. 아래는 초기 목록이며 1·2번은 I-0·I-1로 완료됐다.
1. **저장소 구성**: pnpm workspace(`pnpm-workspace.yaml`, 락파일, `packageManager`), `.nvmrc` 24, `engines`, 빌드 스크립트 허용 목록, `@types/mdast` 등 암묵 의존성 명시, vitest에서 `web/e2e` 제외([ADR-0013](adr/0013-runtime-and-package-manager.md)).
2. **PoC → `packages/core` 승격**: `core.ts`(변환), `engine/types.ts`·`engine/rhwp.ts`, `parse.ts`, `validate.ts`, `blocks.ts`, `verify.ts`. Node 전용(`convert.ts`, `mermaid.ts`, `engine/rhwp-node.ts`)은 `packages/cli`로([ADR-0011](adr/0011-core-adapter-split-by-injection.md)).
3. **하드코딩 제거(프로필화)**: `FIELD_MAP`, 라벨 이름(`UC ID` 등), 유스케이스 전용 IR·스키마, 표 선택(첫 표), 흐름 번호 형식. 프로필 형식 v1은 I-2에서 정의·구현했다([doctype-profile.md](04-conversion/doctype-profile.md)).
4. **정책 구현**: 양식에 라벨·누름틀이 없을 때의 동작(지금은 경고 후 값 누락), `--strict`, 다중 구역 양식 처리.
5. **시험 이관**: PoC의 vitest 10개 + Playwright 시나리오를 패키지별로 옮기고, 합성 양식 외 실제 양식 시험을 추가한다.
6. **한컴 확인 절차**: S-23 산출물을 한컴 환경에서 열어 확인할 사람과 절차를 정한다.

착수 조건: 프로필 형식 v1(완료), 한컴 확인(S-23)은 병행(결과에 따라 [ADR-0012](adr/0012-repeat-block-by-table-clone.md)의 쪽 나눔 방식을 재검토).

## 후순위 메모 (요청 전에는 구현하지 않음)
- **HWP 5.0 출력**: 엔진 `export('hwp')`는 열려 있으나 검증하지 않음 ([ADR-0010](adr/0010-hwpx-first-output.md)).
- **Excel 출력**: ExcelJS 4.4.0(MIT, 마지막 릴리스 2023-10) 시험에서 양식 불러오기·셀 채움·행 복제·이미지 삽입·재로드 성공. 복제한 행의 데이터 검증은 복사되지 않음.
- **DOCX/PPTX/Google**: 구현 계획 없음. 엔진 인터페이스([engine-interface.md](02-architecture/engine-interface.md))로 구조상 여지만 둔다.
- **서버(다수 사용자)**: 문서 서버 전송 허용 여부가 정해진 뒤 방안을 정리한다.
- **HWPX XML 패치 엔진**: 수정하지 않은 부분을 보존하는 방식(python-hwpx 참고). S-02·S-19에서 rhwp의 양식 보존 문제(쪽번호 컨트롤 감소 등)가 확인될 때 검토.
- **양식 자동 도출(LLM 보조)**, 한컴 호환 코퍼스 측정.

## 미결 사항
- "한컴과 거의 동일"의 기준과 한컴에서 확인해 줄 사람
- 양식 샘플 제공, 제출처의 HWP 5.0 필수 여부
- MCP 우선순위, md 원본 정책(한글에서 고친 내용을 md로 되돌리지 않음)
- 서버 정책, 주로 쓸 MCP 클라이언트
- 글꼴 제공 방식(렌더 환경, 한컴 글꼴 라이선스)
