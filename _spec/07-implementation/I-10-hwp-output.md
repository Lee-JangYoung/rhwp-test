# I-10 HWP 5.0 출력 (1차)

상태: **구현 완료(2026-10-15, 한컴 열림 미확인).** 결과는 문서 끝 "구현 결과". 결정: [ADR-0019](../adr/0019-multi-format-output.md). 선행: I-3·I-5(변환), S-02(HWP·HWPX 왕복).

## 목표
한 번의 변환에서 **HWPX와 HWP 5.0을 함께** 낸다. HWP는 같은 세션의 `exportHwp()`(HWPX 출처 문서에 HWPX→HWP 어댑터를 자동 적용, CFB 바이너리)로 만든다. 사전 시험(S-30): 유스케이스·클래스·DB 명세서 산출물을 저장해 재로드한 쪽수·표 수·셀 텍스트가 같았다.

## 작업
1. 엔진: `DocumentSession.exportHwp()`.
2. 코어: `ConvertInput.formats`(기본 `['hwpx']`), 결과에 `hwp` 바이트, 보고에 `hwp` 검증. **HWP 자체 검증**: 저장한 HWP를 다시 열어 HWPX 재로드 결과와 비교(쪽수·표 수·표별 셀 텍스트·누름틀 값·그림 수), 불일치는 실패 항목으로 보고.
3. CLI: `convert --format hwpx,hwp`(기본 hwpx), 출력 이름은 같은 이름에 확장자만 다름. HWP 검증 실패는 종료 코드 2.
4. MCP: `convert_md`의 `formats`, 저장 경로 가드(`.hwp`). 웹: 변환 결과의 "HWP 저장" 버튼.
5. 한컴 확인 키트에 HWP 산출물과 점검표 항목 추가.
6. 시험·문서: 4개 문서 유형의 HWP 왕복, 검증이 불일치를 잡는지, CLI·MCP·웹, 검증 기록(S-30)·한계(L-23).

## 완료 기준
- 모든 내장 문서 유형(Mermaid 그림 포함)에서 HWP가 만들어지고 자체 검증을 통과한다. HWPX 출력(골든)은 바뀌지 않는다.
- `pnpm check`·Playwright 통과. 한컴에서 열림은 사람이 확인(미검증으로 표시).

## 결정 사항 (권장안)
| # | 결정 | 근거 |
|---|---|---|
| D1 | 기본 출력은 계속 HWPX만, HWP는 `--format`으로 선택 | 기존 동작 보존 |
| D2 | HWP는 HWPX 재로드와 비교해 검증(별도 기준 문서 없음) | 같은 내용이어야 하는 것이 요구 |
| D3 | HWP 저장 실패·검증 실패는 HWPX 산출물을 막지 않고 보고에 실패로 남김 | HWPX가 기준 출력 |

## 구현 결과
- 엔진 `exportHwp()`, 코어 `convertBytes({formats:['hwpx','hwp']})` → `{bytes, hwp?}`, 보고 `report.hwp`(`ok`·`checks`·`notes`·`bytes`·`error?`). Node `convert({formats})`는 `outPath`의 확장자만 `.hwp`로 바꿔 저장하고, **검증을 통과한 HWP만 쓴다**(D3: HWPX는 이미 저장됨).
- 검증(`verifyHwp`): CFB 서명, HWP 재로드 성공, 표 수·표별 셀 텍스트·누름틀 값·그림 수가 HWPX 재로드와 같음. **쪽 수 차이는 실패가 아니라 `notes`**(구현 중 발견: 키트 04 '글자처럼 취급' 긴 표 1쪽 vs 3쪽, 내용 동일 → L-23). 계획과 달라진 점.
- CLI `--format hwpx,hwp`(잘못된 값은 종료 코드 1, HWP 검증 실패는 2), MCP `convert_md.formats`(→ `outHwp`, `hwp`), 웹 "HWP 저장"(최종 변환 때만 HWP를 만들고 검증 통과 시 활성), 한컴 키트에 `.hwp` 7개와 점검 항목.
- 시험 +9: `core/test/hwp-output.test.ts`(4유형·Mermaid·기본 출력 바이트 불변·검증이 불일치/깨진 파일을 잡음), CLI, MCP, 웹 e2e(CFB 서명). 기록: S-30, L-23.
- **미검증**: 한컴·구버전 한글에서 `.hwp` 열림(S-23), HWP의 쪽 수 차이 원인.
