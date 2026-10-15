# 로드맵

단계별 계획·결정은 [07-implementation/](07-implementation/)가 기준이다. 개발 브랜치 `impl/core`, 단계마다 PR로 `main`에 병합한다.

| 단계 | 내용 | 상태 |
|---|---|---|
| 0 | 양식 확보(실제 SI 양식) | **대기** — 실제 양식 없음, 합성 양식으로 시험 |
| 1 | 검증 PoC | 완료(rhwp 내). 보관 브랜치 `archive/poc-final` |
| I-0~I-3 | 기반, 코어 이식, 프로필 v1, 프로필 기반 변환 | 완료 |
| I-A | LLM 프로필 생성·검토(`@yangsik/author`) | 구현. **실제 모델 호출 미검증**(S-26) |
| I-4~I-8 | CLI, 두 번째 문서 유형, 양식 등록·한컴 키트, MCP, 웹 UI(React + MUI) | 구현. 한컴 열림(S-23)은 사람 확인 대기 |
| 평가·재설계 | 성능(S-28), 독립 검토(S-29), 결함 수정, 성능 개선, I-9(점검=변환·엄격 md) | 완료. [evaluation-2026-10.md](08-evaluation/evaluation-2026-10.md) |
| **I-10** | **HWP 5.0 출력**(1차) | **구현**. 한컴 열림 미확인 → [I-10](07-implementation/I-10-hwp-output.md) |
| I-13 | 패키지·폴더 재편(core / engine-rhwp / hwp / diagram + apps) — I-11 전에 수행 | **구현** → [I-13](07-implementation/I-13-repo-layout.md), [ADR-0020](adr/0020-package-restructure.md) |
| I-11 | ERD PNG(2차): md 관계 열 + mermaid `erDiagram`, Canvas 2D | 계획, **승인 대기** → [I-11](07-implementation/I-11-erd.md) |
| I-12 | Office 출력(3차): DOCX·XLSX·PPTX 코드 생성 | 계획, **승인 대기** → [I-12](07-implementation/I-12-office-export.md) |

출력 포맷 확장의 결정: [ADR-0019](adr/0019-multi-format-output.md). HWPX가 기준 출력이고 HWP 5.0은 같은 세션에서 파생한다.

## 후순위 메모 (요청 전에는 구현하지 않음)
- **양식 기반 Office 출력**: docx·pptx 템플릿 채우기. I-12는 코드 생성 먼저.
- **Google 출력**, **서버(다수 사용자)**: 문서 서버 전송 허용 여부가 정해진 뒤 방안을 정리한다.
- **HWPX XML 패치 엔진**: 수정하지 않은 부분을 보존(python-hwpx 참고). rhwp의 양식 보존 문제(쪽번호 컨트롤 감소 등, S-02·S-19)가 확인될 때 검토.
- **배포 형태**: 빌드·번들·단일 실행 파일(SEA) 미정. 지금은 `tsx`로 소스를 실행한다.
- 표 사이 문단 복제, 항목별 서술 절(문단 복제), 병합 셀이 있는 목록 표(L-20·L-21): 실제 양식에서 필요가 확인될 때.

## 미결 사항
- "한컴과 거의 동일"의 기준과 한컴에서 확인해 줄 사람(S-23, HWP 포함)
- 실제 SI 양식 샘플 제공, 제출처의 HWP 5.0 필수 여부
- 주로 쓸 MCP 클라이언트, md 원본 정책(한글에서 고친 내용을 md로 되돌리지 않음)
- 서버 정책, 글꼴 제공 방식(렌더 환경, 한컴 글꼴 라이선스), 배포 형태
- 실제 LLM으로 프로필 생성 검증(S-26): 키·모델 필요
