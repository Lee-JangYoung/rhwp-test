# I-4 CLI 재설계

상태: **권장안으로 구현 완료**(개발자 지시: 계획된 기능을 먼저 끝까지 개발하고 평가 후 재설계). 아래 결정은 권장안이며 기능 평가 때 다시 본다. 단계 표: [roadmap.md](../roadmap.md). 명세 초안: [cli.md](../05-interfaces/cli.md).

## 목표
프로필 기반 변환·점검·드라이런·생성(I-A)을 **일관된 명령 체계**로 노출한다. 사람이 쓰기도, LLM 에이전트가 JSON으로 쓰기도 쉬워야 한다. 코어 함수의 얇은 어댑터이며 변환 로직을 두지 않는다.

## 명령 체계

| 명령 | 역할 | 코어 |
|---|---|---|
| `yangsik doctor` | 환경 점검(rhwp, Chromium) | `rhwpEngine`, `findChromium` |
| `yangsik convert <md...> -p <profile> [-o out]` | 변환(여러 md 가능), 자체 검증 | `convert` |
| `yangsik validate <md...> -p <profile>` | md 규약 검사만(줄 번호) | `readMarkdown`, `validateData` |
| `yangsik profile check <profile>` | 프로필 점검(문법·스키마·양식 대조) | `loadProfileFile`, `checkProfile` |
| `yangsik profile test <profile> [--md 예제]` | 드라이런 + 매핑 대조표 | `testProfile` |
| `yangsik profile analyze <양식.hwpx>` | 양식 사실 JSON | `analyzeTemplate` |
| `yangsik profile kinds` / `guide [주제]` / `schema` | 쓸 수 있는 kind, 작성 가이드, JSON Schema | `describeKinds`, `getProfileGuide`, `buildProfileSchema` |
| `yangsik profile generate` | LLM으로 프로필 생성·검토(I-A) | `@yangsik/author` |

- 공통 옵션: `--json`(기계가 읽는 출력, 사람용 문장은 stderr), `--strict`(경고도 실패로).
- 종료 코드(cli.md): `0` 성공(경고 가능) · `1` 입력/설정 오류(md 위반, 프로필 오류, 인자 오류) · `2` 변환은 했으나 자체 검증 실패 · `3` 예기치 못한 오류 · `4` `--strict`에서 경고. (cli.md 초안의 3=strict를 4로 옮기고 3을 내부 오류로 쓴다.)
- 네트워크는 `profile generate`에서만 쓴다. 그 명령은 `--allow-send` 없이는 호출하지 않고, `--print-prompt`로 전송 내용을 보여 준다.

### `profile generate`
`--template 양식.hwpx --example-md 예제.md [--schema 규약.json] [--type 이름] [--hint 설명] --provider anthropic|openai|ollama --model <id> [--capability A|B|C] [--max-iterations 5] [--max-tokens 400000] [--out 폴더] [--allow-send] [--print-prompt]`
- 제공자 패키지(`@langchain/anthropic` 등)는 **필요한 것만 설치**한다(없으면 설치 방법을 안내). 키는 환경변수로만 받는다.
- `--out`에 `profile.yaml`, `review.md`, `review.json`을 쓴다. 통과하지 못해도 마지막 초안과 보고서를 남기고 종료 코드 1.
- 양식·스키마·예제는 프로필 폴더가 아직 없으므로 인자로 받는다. 통과한 초안을 `templates/<유형>/`에 놓는 일은 사람이 한다(템플릿 복사는 `--out`이 이미 폴더이면 양식·예제를 함께 복사 옵션 `--copy-inputs`).

## 결정 사항 (권장안)

| # | 결정 | 선택지 | 권장과 근거 |
|---|---|---|---|
| D1 | 명령 이름 | (a) `yangsik <명령>` (b) `md2hwp`(초안) | **(a)** 제품명과 일치 |
| D2 | 인자 파서 | (a) `node:util.parseArgs` + 명령별 정의(의존성 없음) (b) commander 등 | **(a)** 필요한 기능이 단순하다. 도움말은 명령 표에서 생성 |
| D3 | 실행 방식 | (a) `bin/yangsik.mjs`가 `tsx`를 등록해 TS 소스 실행(빌드 없음) (b) 빌드 산출물(dist) | **(a)** 지금은 비공개 패키지. 배포 형태(빌드·번들)는 기능 평가 후 결정 |
| D4 | 출력 | 사람용(기본) / `--json` | 사람용은 요약+검증 항목, JSON은 코어 결과 그대로 |
| D5 | 여러 md | `convert a.md b.md -o out/` (폴더면 이름 유지) | 한 번에 여러 문서. 하나라도 위반이면 그 파일만 실패로 집계하고 계속 |
| D6 | `analyze` | `profile analyze`로 이동, 옛 `analyze`·`check` 제거 | 0.x. 환경 점검은 `doctor` |

## 작업
1. `packages/cli/src/` 분리: `cli.ts`(진입·라우팅), `commands/*.ts`(명령별), `output.ts`(사람용/JSON 출력), `exit.ts`(종료 코드).
2. `bin/yangsik.mjs`, 루트 스크립트 `pnpm yangsik`.
3. `profile generate`는 `@yangsik/author`를 동적으로 불러온다(CLI 기본 의존에 LLM 라이브러리를 넣지 않는다: `@yangsik/author`는 선택 의존).
4. 시험: 프로세스로 CLI를 실행해 종료 코드·출력 확인(합성 양식, 위반 md, 틀린 프로필, JSON 출력, 여러 md, `--strict`, `profile generate`의 `--allow-send` 없음/`--print-prompt`). 실제 LLM 호출은 제외.
5. 문서: [cli.md](../05-interfaces/cli.md) 갱신.

## 완료 기준
- 위 명령이 동작하고 종료 코드가 규약대로다. `pnpm check` 통과.
- `--json` 출력은 파싱 가능한 JSON 하나다(stdout에는 JSON만).
- CLI 패키지의 필수 의존에 LLM 라이브러리가 없다.

## 구현 결과
- `packages/cli`: `bin/yangsik.mjs`(tsx 등록 후 `src/cli.ts`), `commands/{doctor,convert,validate,profile}.ts`, `util.ts`(종료 코드, `--json` 출력 분리). 인자 파서는 `node:util.parseArgs`.
- 시험 11개(프로세스 실행): 도움말·종료 코드, 위반 줄 번호, 여러 md, `--json` 순수 출력, 프로필 오류(코드·후보), 드라이런, 분석·kinds·guide·schema, `profile generate`의 전송 비허용/미리보기/제공자 미설치 안내, CLI 필수 의존에 LLM 없음.
- 정한 것: `--copy-inputs`는 `--out` 폴더에 양식·예제·스키마를 `template.hwpx`·`example.md`·`schema.json`으로 복사한다(생성 프롬프트가 프로필의 `template`·`schema` 값을 이 이름으로 쓰도록 지시한다).
- 이월: 배포 형태(빌드·번들), `preview <hwpx>` 명령, 실제 모델로 `profile generate` 실행(S-26).
