# CLI: md2hwp

요구: FR-14, FR-16, FR-17, FR-19

## 사용법

```bash
md2hwp convert <input.md...> -t <template> -m <style-map.yaml> [options]
md2hwp inspect <template>            # 양식의 스타일·필드·책갈피 목록 출력
md2hwp validate <style-map.yaml> -t <template>   # 맵과 양식 대조
md2hwp preview <file.hwp|hwpx> [-p 0] -o out.svg # SVG 미리보기
```

## `convert` 옵션

| 옵션 | 기본 | 설명 |
|---|---|---|
| `-t, --template <path>` | 맵의 `template.path` | 양식 파일 |
| `-m, --map <path>` | 필수 | style-map.yaml |
| `-f, --format <hwp\|hwpx>` | 맵의 `output.defaultFormat` | 출력 포맷 |
| `-o, --out <path\|dir>` | 입력과 같은 위치 | 출력 경로/디렉터리 |
| `--report <path>` | 표준 출력 요약 | JSON 리포트 저장 |
| `--preview <svg\|pdf>` | 없음 | 미리보기 생성 |
| `--strict` | off | 경고를 오류로 처리 |
| `--fonts <dir>` | 내장 근사 | 글꼴 메트릭용 글꼴 디렉터리 |
| `--no-diagram` | off | 다이어그램 렌더 생략(원문 유지) |
| `--set key=value` | | front-matter 값 덮어쓰기 |

## 예시

```bash
md2hwp convert report.md -m templates/report/style-map.yaml -f hwpx -o out/ --report out/report.json
md2hwp convert docs/*.md -m templates/report/style-map.yaml -f hwp --strict
```

## 종료 코드

| 코드 | 의미 |
|---|---|
| 0 | 성공 (경고 가능) |
| 1 | 입력/설정 오류 (파일 없음, 스키마 위반) |
| 2 | 변환 실패 (rhwp 오류, 저장 검증 실패) |
| 3 | `--strict`에서 경고 발생 |

## 리포트(JSON) 스키마 (요약)

```json
{
  "input": "report.md",
  "output": "out/report.hwpx",
  "format": "hwpx",
  "rhwpVersion": "0.8.7",
  "pages": 12,
  "verify": { "reloaded": true, "pageCountMatch": true, "contentLoss": false },
  "warnings": [{ "code": "UNSUPPORTED_HTML", "line": 42, "message": "원시 HTML 무시" }],
  "missingStyles": [],
  "assets": { "images": 3, "diagrams": 2 }
}
```

## 비기능
- 표준 출력은 사람이 읽는 요약, 기계 처리는 `--report`를 사용한다.
- 일괄 변환 시 파일 단위로 실패를 격리하고 마지막에 요약한다.
- 네트워크를 사용하지 않는다(NFR-07).
