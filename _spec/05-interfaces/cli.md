# CLI: yangsik

결정 근거와 계획: [I-4](../07-implementation/I-4-cli.md). 코어 함수의 얇은 어댑터이며 변환 로직이 없다. 실행: `pnpm yangsik <명령>` 또는 `node packages/cli/bin/yangsik.mjs <명령>` (TS 소스를 `tsx`로 실행, 빌드 없음).

```bash
yangsik doctor                                     # 환경 점검(rhwp, Chromium, Node)
yangsik convert <md...> -p <profile> [-o 출력] [--report f] [--preview dir] [--no-mermaid] [--strict] [--json]
yangsik validate <md...> -p <profile> [--strict] [--json]
yangsik profile check <profile> [--strict] [--json]       # 문법·스키마·양식 대조 (줄 번호·후보)
yangsik profile test <profile> [--md 예제.md] [--no-mermaid]  # 드라이런 + 매핑 대조표
yangsik profile analyze <양식.hwpx>                 # 양식 사실 JSON
yangsik profile kinds [--all] | guide [주제] | schema   # LLM·사람용 작성 자료
yangsik profile generate --template 양식.hwpx --example-md 예제.md --provider <anthropic|openai|ollama> --model <id> --allow-send [--out 폴더]
```

- `-o`: 하나뿐이고 `.hwpx`로 끝나면 그 파일, 아니면 폴더(기본 `out/`)에 md 이름으로 쓴다. 여러 md 중 일부가 위반이어도 나머지는 변환하고 종료 코드는 가장 나쁜 것을 따른다.
- 종료 코드: `0` 성공(경고 가능) · `1` 입력/설정 오류(md 규약 위반, 프로필 오류, 인자 오류) · `2` 변환은 했으나 자체 검증 실패 · `3` 예기치 못한 오류 · `4` `--strict`에서 경고.
- `--json`: stdout에는 JSON 하나만 나오고 사람용 문장은 stderr로 간다.
- 네트워크는 `profile generate`에서만 쓴다. `--allow-send` 없이는 호출하지 않으며 `--print-prompt`로 전송 내용(가이드·양식 사실·예제 md, HWPX 바이너리 제외)을 미리 본다. 제공자 패키지(`@langchain/anthropic` 등)는 필요한 것만 설치하고 키는 환경변수로 준다. 결과는 `--out`에 `profile.yaml`·`review.md`·`review.json`.
- `profile generate`: `--max-iterations`·`--max-tokens`는 1 이상의 정수, `--out`에 `profile.yaml` 등이 이미 있으면 거부(`--force`로 덮어씀). 입력 오류(없는 파일 등)는 종료 코드 1이고, 여러 md 중 일부가 실패해도 나머지를 변환하고 요약(`--json`)·보고서(`--report`)를 남긴다. 같은 이름의 md가 여러 개면 시작 전에 거부한다.
- 미구현(후순위): `preview <hwpx>`(쪽별 SVG는 `convert --preview`로 얻음), 양식 자동 도출(`init`).
