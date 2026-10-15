# CLI: md2hwp (가설)

옵션과 출력은 구현 시 확정한다.

```bash
md2hwp convert <input.md...> -p <profile> [-o out] [--report report.json] [--strict]   # 기본 출력 hwpx
md2hwp validate <input.md> -p <profile>    # 규약 검사만
md2hwp analyze <양식.hwpx>                  # 양식 분석 JSON(스타일·필드·표 구조) — 프로필 작성 보조
md2hwp preview <file> [-n 0] -o out.svg
```

- 종료 코드: `0` 성공(경고 가능) · `1` 입력/설정 오류 · `2` 변환·저장 검증 실패 · `3` `--strict`에서 경고
- 리포트(JSON): 출력 경로, 포맷, rhwp 버전, 쪽수, 재로드 검증, 손실 여부, 경고, 누락 스타일
- 네트워크를 사용하지 않는다. 양식 자동 도출(`init`)은 후순위.
