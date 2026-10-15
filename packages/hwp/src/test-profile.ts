import {
  checkProfile,
  type CheckResult,
  type DocumentEngine,
  type Issue,
  type Profile,
  type Violation,
} from '@yangsik/core';
import { type ConvertReport, convertBytes, type DiagramRenderer, ProfileError, ValidationError } from './convert';
import { type MappingPreview, previewMapping } from './mapping';

export interface ProfileTestResult {
  ok: boolean;
  /** 프로필 점검 결과 */
  check: CheckResult;
  /** 예제 md가 규약에 맞지 않을 때 */
  violations?: Violation[];
  /** 변환 중 확인된 프로필 오류 */
  issues?: Issue[];
  /** 변환 보고(자체 검증 포함). 변환까지 간 경우 */
  report?: ConvertReport;
  /** 양식 라벨 ↔ md 값 대조표 */
  mapping?: MappingPreview;
}

/**
 * 드라이런: 프로필을 예제 md로 실제 변환해 본다. 점검을 통과해도 결과가 맞다는 보장은 아니므로,
 * LLM이 쓴 프로필의 품질을 확인하는 단계로 쓴다(R-03). 오류는 던지지 않고 결과에 담는다.
 */
export async function testProfile(
  engine: DocumentEngine,
  input: {
    profile: Profile;
    template: Uint8Array;
    exampleMd: string;
    dataSchema?: object;
    renderDiagram?: DiagramRenderer;
  },
): Promise<ProfileTestResult> {
  const check = await checkProfile(engine, input.profile, input.template, { dataSchema: input.dataSchema });
  if (!check.ok) return { ok: false, check };
  const mapping = await previewMapping(engine, input.profile, input.exampleMd, input.template);
  try {
    const { report } = await convertBytes(engine, {
      profile: input.profile,
      mdText: input.exampleMd,
      mdName: 'example.md',
      template: input.template,
      dataSchema: input.dataSchema,
      renderDiagram: input.renderDiagram,
      skipDiagrams: !input.renderDiagram,
    });
    return { ok: report.verify.ok, check, report, mapping };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, check, violations: e.violations, mapping };
    if (e instanceof ProfileError) return { ok: false, check, issues: e.issues, mapping };
    throw e;
  }
}
