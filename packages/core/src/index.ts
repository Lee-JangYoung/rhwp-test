/**
 * @yangsik/core — 환경 독립 변환 코어 (Node·브라우저 공통).
 * Node 전용 기능(파일 입출력, WASM 로더, Mermaid CLI)은 `@yangsik/core/node`에 있다.
 * 0.x 동안 API는 안정적이지 않다.
 */
export { convertBytes, ValidationError } from './convert/convert';
export type { ConvertInput, ConvertReport, DiagramRenderer, RenderedDiagram } from './convert/convert';
export { previewMapping } from './convert/mapping';
export type { MappingPreview, MappingRow } from './convert/mapping';
export { createRhwpEngine } from './engine/rhwp';
export type * from './engine/types';
export { parseMarkdown } from './markdown/parse';
export {
  analyzeTemplate,
  buildProfileSchema,
  checkProfile,
  describeKinds,
  getProfileGuide,
  GUIDE_TOPICS,
  ISSUE_CODES,
  parseProfile,
} from './profile/index';
export type {
  Binding,
  CheckResult,
  GuideTopic,
  Issue,
  IssueCode,
  KindDescription,
  ParseResult,
  Profile,
  TemplateFacts,
} from './profile/index';
export type { Ir } from './markdown/parse';
export { formatViolations, validateIr } from './markdown/validate';
export type { Violation } from './markdown/validate';
