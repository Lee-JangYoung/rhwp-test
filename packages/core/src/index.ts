/**
 * @yangsik/core — 환경 독립 변환 코어 (Node·브라우저 공통).
 * Node 전용 기능(프로필 파일 읽기, Mermaid CLI)은 `@yangsik/core/node`에 있다. 변환은 `@yangsik/hwp`, rhwp 엔진은 `@yangsik/engine-rhwp`.
 * 0.x 동안 API는 안정적이지 않다.
 */
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
  closest,
  getProfileGuide,
  GUIDE_TOPICS,
  ISSUE_CODES,
  parseProfile,
} from './profile/index';
export type {
  Binding,
  CheckResult,
  Format,
  GuideTopic,
  Issue,
  IssueCode,
  KindDescription,
  Locator,
  ParseResult,
  Policy,
  Profile,
  TemplateFacts,
  ValueSpec,
} from './profile/index';
