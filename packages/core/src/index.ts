/**
 * @yangsik/core — 환경 독립 변환 코어 (Node·브라우저 공통).
 * Node 전용 기능(파일 입출력, WASM 로더, Mermaid CLI)은 `@yangsik/core/node`에 있다.
 * 0.x 동안 API는 안정적이지 않다.
 */
export { convertBytes, ProfileError, ValidationError } from './convert/convert';
export type { ConvertInput, ConvertReport, DiagramRenderer, OutputFormat, RenderedDiagram } from './convert/convert';
export { previewMapping } from './convert/mapping';
export { testProfile } from './convert/test-profile';
export type { ProfileTestResult } from './convert/test-profile';
export type { MappingPreview, MappingRow } from './convert/mapping';
export { createRhwpEngine } from './engine/rhwp';
export type * from './engine/types';
export { readMarkdown } from './markdown/read';
export type { MdRead } from './markdown/read';
export { formatViolations, validateData } from './markdown/validate';
export type { Violation } from './markdown/validate';
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
  Locator,
  ParseResult,
  Profile,
  TemplateFacts,
} from './profile/index';
