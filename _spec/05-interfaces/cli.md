# CLI: md2hwp (가설)

옵션과 출력은 구현 시 확정한다. CLI는 코어 검증과 자동화(CI)의 1순위 어댑터다.

```bash
# 변환
md2hwp convert <input.md...> -p <profile 디렉터리> [-f hwp|hwpx] [-o out] [--report report.json] [--strict]
md2hwp validate <input.md> -p <profile>            # 규약 검사만
md2hwp preview <file> [-n 0] -o out.svg            # SVG 미리보기

# 양식 등록
md2hwp analyze <양식.hwp|hwpx> [-o analysis.json]  # ① 분석 결과(표·병합·필드·스타일·반복 후보)
md2hwp init <양식> -d <profile 디렉터리> [--from analysis.json]  # 프로필 초안 생성(LLM 보강 결과를 받아 검증·조립)
md2hwp inspect <양식>                              # 스타일·필드·책갈피 목록
```

- 종료 코드: `0` 성공(경고 가능) · `1` 입력/설정 오류 · `2` 변환·저장 검증 실패 · `3` `--strict`에서 경고
- 리포트(JSON): 출력 경로, 포맷, rhwp 버전, 쪽수, 재로드 검증, 손실 여부, 경고, 누락 스타일
- 일괄 변환은 파일 단위로 실패를 격리하고 끝에 요약한다. 네트워크를 사용하지 않는다.
- `init`은 LLM을 직접 부르지 않는다. 초안 해석은 호스트 에이전트(MCP)나 사람이 제공한 JSON을 받아 검증·조립한다([ADR-0007](../adr/0007-llm-by-host-agent-conversion-llm-free.md)).
