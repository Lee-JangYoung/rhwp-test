# MCP 서버 (가설)

결정: [ADR-0008](../adr/0008-core-with-cli-mcp-web-adapters.md) — MCP는 코어 위의 어댑터다. LLM 에이전트(MCP 클라이언트)가 "양식 조회 → md 작성 → 검증 → 수정 → 변환"을 도구 호출로 수행하게 한다.

## 원칙
- **LLM 호출은 호스트 에이전트가 담당**한다([ADR-0007](../adr/0007-llm-by-host-agent-conversion-llm-free.md)). 서버는 분석 결과·지침·검증 결과를 도구로 돌려줄 뿐 LLM API를 부르지 않는다.
- 전송은 stdio, 처리는 로컬. 문서를 외부로 보내지 않는다.
- 파일 접근은 허용 디렉터리(작업 폴더, `templates/`)로 제한한다(경로 탈출 방지).

## 도구 후보

| 도구 | 용도 | 단계 |
|---|---|---|
| `list_doctypes` | 등록된 문서 유형 목록 | 변환 |
| `get_md_template` | 유형의 `template.md` + `prompt.md` 반환 | 변환 |
| `validate_md` | 스키마 검증, 위반 목록(줄 번호·기대 값) | 변환 |
| `convert_md` | md → HWP/HWPX, 리포트 반환 | 변환 |
| `preview` | 쪽별 SVG 반환 | 변환 |
| `analyze_template` | 양식 분석 결과(표·병합·필드·스타일·반복 후보) JSON 반환 | 등록 |
| `save_profile` | LLM이 만든 초안을 스키마 검증 후 프로필로 저장 | 등록 |

## 참고: rhwp 내장 MCP
`rhwp mcp-serve`는 읽기·검색·필드 채움·셀 쓰기·치환 중심이며 **md → HWP 생성 도구가 없고** 세션 도구는 읽기 전용이다. 대체할 수 없고, 양식 분석 결과 대조(`hwp_export_tables`, `hwp_ir_diff` 등)에 참고한다. 출처: [rhwp MCP 통합 가이드](https://github.com/edwardkim/rhwp/blob/main/mydocs/manual/mcp_integration_guide.md)

## 미결
주로 쓸 MCP 클라이언트(Claude Code/Desktop 등)가 정해지지 않았다. 배포 방식(npx, 설정 예시)은 확정 후 작성한다.
