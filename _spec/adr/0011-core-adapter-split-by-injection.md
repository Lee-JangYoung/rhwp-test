# ADR-0011: 코어와 환경 어댑터를 주입으로 분리한다

- 상태: 채택 (PoC로 Node·브라우저 동작 확인, [S-18](../06-quality/verification-spike.md)). [ADR-0003](0003-environment-agnostic-core.md)의 `Env` 인터페이스 형태를 이 결정으로 대체한다.
- 날짜: 2026-10-15

## 배경
ADR-0003은 `Env`(`loadWasm`, `measureTextWidth`, `readAsset`, `renderDiagram`) 하나를 주입하는 형태를 가설로 했다. PoC에서 같은 코어가 Node와 브라우저에서 돌았고, 환경 차이는 WASM 초기화·Mermaid 렌더·파일 입출력 세 곳에 모였다.

## 결정
- 변환 본체는 **바이트와 문자열만 받는 순수 함수**다: `convertBytes(engine, { mdText, template, schema, renderDiagram?, … }) → { bytes, report, previews }`. `fs`, `Buffer`, `child_process`, `document`를 쓰지 않는다.
- WASM 초기화는 엔진 팩토리에 주입한다: `createRhwpEngine(init)`. Node 어댑터는 `initSync`, 브라우저는 `init({module_or_path})`.
- Mermaid는 `DiagramRenderer`(소스 → PNG)로 주입한다. Node는 mermaid-cli, 브라우저는 `mermaid`+canvas.
- 스키마는 파일 경로가 아니라 객체로 받는다. 파일 읽기와 쓰기는 CLI 어댑터가 한다.
- `measureTextWidth`는 어댑터가 전역에 둔다. 호출 여부와 정확도는 S-11에서 확인한다.

## 대안
| 대안 | 장점 | 단점 |
|---|---|---|
| `Env` 객체 하나 주입(ADR-0003) | 한 곳에서 환경을 정의 | 변환이 쓰지 않는 메서드까지 구현해야 함 |
| Node 전용 코어 + 웹은 서버 호출 | 구현 단일 | 문서가 서버로 전송됨 |

## 결과
- 같은 코어 코드가 CLI와 웹에서 동작하고, 단위 시험은 rhwp·파일 시스템 없이 가능한 부분이 많다.
- Node 전용 코드는 `convert`(파일 래퍼), Mermaid CLI 연결, WASM 로더, CLI에 한정된다.
