/**
 * @yangsik/hwp — 양식 채움 변환(HWPX)과 HWP 5.0 저장, 저장 후 자체 검증. 환경 독립(Node·브라우저).
 * 엔진은 주입받는다(`DocumentEngine`). Node 파일 변환은 `@yangsik/hwp/node`.
 * 0.x 동안 API는 안정적이지 않다.
 */
export { convertBytes, ProfileError, ValidationError } from './convert';
export type { ConvertInput, ConvertReport, DiagramRenderer, OutputFormat, RenderedDiagram } from './convert';
export { previewMapping } from './mapping';
export type { MappingPreview, MappingRow } from './mapping';
export { testProfile } from './test-profile';
export type { ProfileTestResult } from './test-profile';
