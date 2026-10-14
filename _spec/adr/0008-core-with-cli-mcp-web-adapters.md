# ADR-0008: 코어 + CLI/MCP/웹 어댑터

- 상태: 제안 ([ADR-0001](0001-monorepo-core-cli-web.md)에 MCP 추가)
- 날짜: 2026-10-14

## 배경
LLM 에이전트가 "양식 조회 → md 작성 → 검증 → 수정 → 변환"을 반복하려면 도구 호출 형태가 편하다. 비개발자에게는 웹, CI에는 CLI가 맞다. rhwp 내장 MCP(`rhwp mcp-serve`)는 읽기·필드 채움 중심이고 md → HWP 생성 도구가 없으며 세션 도구가 읽기 전용이다.

## 결정
변환 로직은 `packages/core`에만 두고, 인터페이스는 얇은 어댑터로 얹는다. 우선순위는 **CLI → MCP → 웹**이다.

```
packages/core   packages/cli   packages/mcp   packages/web
```

rhwp 내장 MCP는 대체재가 아니라 양식 분석·결과 대조의 참고 도구로 본다.

## 대안
| 대안 | 장점 | 단점 |
|---|---|---|
| CLI+웹만 | 단순 | LLM 루프가 거침(셸 호출) |
| MCP만 | LLM 친화 | 비개발자·CI 부적합 |
| rhwp 내장 MCP 사용 | 구현 없음 | 생성 기능 없음 |

## 결과
- 어댑터 추가가 코어에 영향을 주지 않는다.
- MCP 클라이언트 종류에 따라 배포 방식이 달라진다(미결).
