# MCP 서버 (가설)

결정: [ADR-0008](../adr/0008-core-with-cli-mcp-web-adapters.md) — 코어 위의 어댑터. LLM 에이전트가 "템플릿 조회 → md 작성 → 검증 → 수정 → 변환"을 도구 호출로 수행한다.

- LLM 호출은 호스트 에이전트가 맡는다([ADR-0007](../adr/0007-llm-by-host-agent-conversion-llm-free.md)). 서버는 LLM API를 부르지 않는다.
- 전송은 stdio, 처리는 로컬. **파일 접근은 허용 디렉터리로 제한**한다(경로 탈출 방지).
- 도구 후보: `list_doctypes`, `get_md_template`(템플릿+지침), `validate_md`(위반 목록), `convert_md`(→ HWPX, 리포트), `preview`(쪽별 SVG), `analyze_template`(양식 분석 JSON).
- rhwp 내장 MCP(`rhwp mcp-serve`)는 읽기·필드 채움 중심이고 md → HWPX 생성 도구가 없어 대체할 수 없다. 출처: [rhwp MCP 통합 가이드](https://github.com/edwardkim/rhwp/blob/main/mydocs/manual/mcp_integration_guide.md)
- 미결: 주로 쓸 MCP 클라이언트, 우선순위, 배포 방식.
