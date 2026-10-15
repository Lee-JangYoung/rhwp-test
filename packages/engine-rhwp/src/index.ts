/**
 * @yangsik/engine-rhwp — rhwp(@rhwp/core, WASM) 엔진 구현. 이 패키지만 @rhwp/core에 의존한다(ADR-0005).
 * 브라우저는 `createRhwpEngine(init)`에 자기 초기화 함수를 넘기고, Node는 `@yangsik/engine-rhwp/node`의 `rhwpEngine`을 쓴다.
 */
export { createRhwpEngine } from './rhwp';
