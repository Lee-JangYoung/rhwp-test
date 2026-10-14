# CLI: md2hwp (가설)

옵션과 출력은 구현 시 확정한다.

```bash
md2hwp convert <input.md...> -m <style-map.yaml> [-t template] [-f hwp|hwpx] [-o out] [--report report.json] [--strict]
md2hwp inspect <template>                 # 양식의 스타일·필드·책갈피 출력
md2hwp validate <style-map.yaml> -t <template>
md2hwp preview <file> [-p 0] -o out.svg   # SVG 미리보기
```

- 종료 코드: `0` 성공(경고 가능) · `1` 입력/설정 오류 · `2` 변환·저장 검증 실패 · `3` `--strict`에서 경고
- 리포트(JSON): 출력 경로, 포맷, rhwp 버전, 쪽수, 재로드 검증 결과, 손실 여부, 경고 목록, 누락 스타일
- 일괄 변환은 파일 단위로 실패를 격리하고 끝에 요약한다. 네트워크를 사용하지 않는다.
