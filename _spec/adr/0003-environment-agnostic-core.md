# ADR-0003: 환경 독립 코어와 환경 주입

- 상태: 제안
- 날짜: 2026-10-14

## 배경
`@rhwp/core`는 `globalThis.measureTextWidth`와 WASM 로딩 방식이 환경(브라우저/Node)마다 다르다. Node에서 근사 폭을 쓰면 쪽수와 줄바꿈이 한컴·브라우저와 달라질 수 있다(스파이크 S-00에서 동작은 확인, 정확도는 S-11).

## 결정
`core`는 `Env` 인터페이스(`loadWasm`, `measureTextWidth`, `readAsset`, `renderDiagram`)를 주입받는다. CLI와 웹이 각자 구현을 제공한다. 코어는 `fs`, `document`, `window`를 직접 참조하지 않는다.

## 대안
| 대안 | 장점 | 단점 |
|---|---|---|
| Node 전용 코어 + 웹은 서버 호출 | 구현 단일 | 문서가 서버로 전송됨, 서버 운영 필요 |
| 브라우저 전용(Playwright로 CLI 구동) | 레이아웃 정확 | CLI가 무겁고 느림 |

## 결과
- 같은 코드가 두 환경에서 동작한다.
- Node의 글자 폭 정확도는 별도 구현(글꼴 메트릭)으로 보완한다.
