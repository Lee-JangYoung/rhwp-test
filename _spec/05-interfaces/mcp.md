# MCP 서버: yangsik-mcp

결정: [ADR-0008](../adr/0008-core-with-cli-mcp-web-adapters.md) 코어 위의 어댑터, [ADR-0007](../adr/0007-llm-by-host-agent-conversion-llm-free.md)·[ADR-0017](../adr/0017-llm-in-authoring-only.md). 구현: `packages/mcp`, 계획·결과: [I-7](../07-implementation/I-7-mcp.md).

- **LLM 호출은 호스트 에이전트가 한다.** 서버는 LLM API를 부르지 않는다(`@yangsik/mcp`에 LLM 라이브러리 의존 없음, 시험으로 확인).
- 전송: stdio, 처리는 로컬. **파일 접근은 허용 폴더(`--root`, 반복 가능; 또는 `YANGSIK_ROOTS=경로1:경로2`; 기본은 현재 폴더)로 제한**한다. 읽기는 심볼릭 링크를 풀어 확인하고, 쓰기는 가장 가까운 기존 상위 폴더로 확인한다. 상대 경로는 첫 허용 폴더 기준.
- 저장(`convert_md`의 `out_path`)은 **`.hwpx` 확장자만**(HWP는 같은 이름의 `.hwp`) 허용하고, 기존 파일이 심볼릭 링크면 대상도 허용 폴더 안이어야 한다. 프로필이 가리키는 양식·규약 경로도 같은 가드를 거친다. 인자는 `--root <폴더>` 또는 `--root=<폴더>`만 받고 값이 없거나 알 수 없는 인자는 오류로 종료한다(조용히 현재 폴더를 허용하지 않음). Mermaid 렌더는 네트워크가 막힌 격리 상태로 수행하고 작업 폴더는 호출마다 따로 만든다.
- 실행: `node apps/mcp/bin/yangsik-mcp.mjs --root <폴더>` (TS 소스를 `tsx`로 실행). 클라이언트 설정 예(Claude Code `.mcp.json` 등):
  ```json
  { "mcpServers": { "yangsik": { "command": "node", "args": ["/절대경로/apps/mcp/bin/yangsik-mcp.mjs", "--root", "/절대경로/templates", "--root", "/절대경로/out"] } } }
  ```

## 도구
**프로필 작성(환각 줄이기: 사실 조회 → 어휘 → 점검 → 드라이런)**

| 도구 | 역할 |
|---|---|
| `analyze_template(template_path)` | 양식 사실: 표별 라벨·머리글, 누름틀, 토큰, 문단 |
| `list_kinds(include_defined?)` | 쓸 수 있는 동작(kind)과 스키마·예시 |
| `get_guide(topic?)` / `get_profile_schema()` | 작성 가이드(주제별), 프로필 JSON Schema |
| `check_profile(profile_path \| profile_yaml+template_path)` | 문법·스키마·양식 대조. 오류에 code·path·line·candidates |
| `test_profile(profile_path, example_md_path?)` | 예제 md 드라이런, 자체 검증, 대조표 |
| `preview_mapping(profile_path, md_path\|md_text)` | 양식 라벨 ↔ md 값 대조표 |

**변환(md 작성 → 검증 → 수정 → 변환)**

| 도구 | 역할 |
|---|---|
| `list_doctypes()` | 허용 폴더 안의 문서 유형(`profile.yaml`) |
| `get_md_template(profile_path)` | md 작성 규칙(제목 패턴·슬롯), 규약, 예제 md |
| `validate_md(profile_path, md_path\|md_text)` | 위반(줄 번호·경로·메시지)과 경고 |
| `convert_md(profile_path, md_path\|md_text, out_path, skip_diagrams?, formats?)` | 변환·저장·자체 검증 보고. `formats:["hwpx","hwp"]`면 같은 이름 `.hwp`도 저장(검증 통과 시)하고 `outHwp`·`hwp`(notes 포함)를 돌려준다. md 위반은 `ok:false`+`violations`, 프로필 오류는 `issues` |
| `preview_output(file_path, page?)` | 변환한 .hwpx의 쪽을 SVG로(rhwp 렌더링, 한컴과 다를 수 있음) |

- 결과는 JSON(텍스트 + `structuredContent`). 사용 오류(허용 폴더 밖 경로, 없는 파일, 인자 누락)는 `isError`.
- rhwp 내장 MCP(`rhwp mcp-serve`)는 읽기·필드 채움 중심이고 md → HWPX 생성 도구가 없어 대체할 수 없다. 출처: [rhwp MCP 통합 가이드](https://github.com/edwardkim/rhwp/blob/main/mydocs/manual/mcp_integration_guide.md)
- 미결: 주로 쓸 MCP 클라이언트 확정, 배포 방식(빌드·패키징), 원격(HTTP) 전송은 후순위.
