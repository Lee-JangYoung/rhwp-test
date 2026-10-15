import type { Binding, Issue, Locator, MappingPreview, Profile, ProfileTestResult, TemplateFacts } from '@yangsik/core';
import type { Attempt, StopReason } from './generate';
import type { Capability, Usage } from './llm';

export interface Rationale {
  path: string;
  why: string;
  confidence?: 'high' | 'medium' | 'low';
  evidence?: string[];
}

export interface TableCoverage {
  /** 양식의 표 번호 */
  table: number;
  /** 라벨이 바인딩 map에 직접 있는 것 */
  mapped: string[];
  /** map에 없지만 '*'(kv 나머지)로 채워질 수 있는 것 */
  viaWildcard: string[];
  /** 어디에도 채워지지 않는 라벨 */
  unmapped: string[];
}

export interface ReviewReport {
  status: 'passed' | 'failed';
  stopReason: StopReason;
  /** 생성 기록 */
  generation: {
    model: string;
    capability: Capability;
    promptVersion: string;
    attempts: number;
    usage: Usage;
    perAttempt: {
      n: number;
      errors: number;
      warnings: number;
      dryRunOk: boolean | null;
      toolCalls: number;
      draftError?: string;
    }[];
  };
  /** 프로그램이 계산한 커버리지 (결정적) */
  coverage: {
    tables: TableCoverage[];
    unmappedFields: string[];
    mdWarnings: string[];
  };
  mapping?: MappingPreview;
  dryRun?: {
    ok: boolean;
    pages: number;
    cellsSet: number;
    cloned: number;
    imagesInserted: number;
    failedChecks: string[];
    warnings: string[];
  };
  /** LLM이 낸 근거. evidence가 양식 사실·예제 md에 실제로 있는지 프로그램이 확인한다 */
  rationale: (Rationale & { unverifiedEvidence: string[] })[];
  /** 남은 점검 오류·경고 (통과하지 못했을 때 사람이 볼 것) */
  remainingIssues: Issue[];
}

export interface ReviewInput {
  llmId: string;
  capability: Capability;
  promptVersion: string;
  stopReason: StopReason;
  attempts: Attempt[];
  usage: Usage;
  facts: TemplateFacts;
  exampleMd: string;
  yaml?: string;
  profile?: Profile;
  rationale?: Rationale[];
  test?: ProfileTestResult;
  issues: Issue[];
  mdWarnings: { line: number; message: string }[];
}

/** 위치 지정에 맞는 양식 표를 사실에서 찾는다 */
function locate(facts: TemplateFacts, loc: Locator | undefined): number[] {
  const t = loc?.table;
  if (!t) return [];
  return facts.tables
    .filter((x) => {
      if (t.index !== undefined) return x.index === t.index;
      if (t.label !== undefined) return x.labels.includes(t.label);
      if (t.headerLabel !== undefined) return x.header.includes(t.headerLabel);
      if (t.text !== undefined) {
        const needle = t.text;
        return [...x.labels, ...x.header, ...x.sample.map((s) => s.text)].some((s) => s.includes(needle));
      }
      return false;
    })
    .map((x) => x.index);
}

export function computeCoverage(facts: TemplateFacts, profile: Profile | undefined): ReviewReport['coverage'] {
  const tables = new Map<number, { mapped: Set<string>; wildcard: boolean }>();
  const mappedFields = new Set<string>();
  const walk = (bindings: Binding[], unit: number[]) => {
    for (const b of bindings) {
      if (b.kind === 'fields') {
        for (const v of Object.values((b.map ?? {}) as Record<string, string>)) mappedFields.add(String(v));
      } else if (b.kind === 'repeat') {
        walk((b.do ?? []) as Binding[], locate(facts, b.unit as Locator));
      } else if (b.kind === 'cells') {
        const targets = b.in ? locate(facts, b.in as Locator) : unit;
        const map = (b.map ?? {}) as Record<string, unknown>;
        for (const i of targets) {
          const cur = tables.get(i) ?? { mapped: new Set<string>(), wildcard: false };
          for (const k of Object.keys(map)) if (k === '*') cur.wildcard = true;
          for (const k of Object.keys(map)) if (k !== '*') cur.mapped.add(k);
          tables.set(i, cur);
        }
      }
    }
  };
  if (profile) walk(profile.bindings, []);
  const out: TableCoverage[] = [...tables.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, cur]) => {
      const labels = facts.tables[i]?.labels ?? [];
      return {
        table: i,
        mapped: labels.filter((l) => cur.mapped.has(l)),
        viaWildcard: cur.wildcard ? labels.filter((l) => !cur.mapped.has(l)) : [],
        unmapped: cur.wildcard ? [] : labels.filter((l) => !cur.mapped.has(l)),
      };
    });
  return {
    tables: out,
    unmappedFields: facts.fields.map((f) => f.name).filter((n) => !mappedFields.has(n)),
    mdWarnings: [],
  };
}

export function buildReview(i: ReviewInput): ReviewReport {
  const cov = computeCoverage(i.facts, i.profile);
  cov.mdWarnings = i.mdWarnings.map((w) => `${w.line}행: ${w.message}`);
  const haystack = `${JSON.stringify(i.facts)}\n${i.exampleMd}`;
  const failedChecks = i.test?.report?.verify.checks.filter((c) => !c.ok).map((c) => c.name) ?? [];
  const r = i.test?.report;
  return {
    status: i.stopReason === 'passed' ? 'passed' : 'failed',
    stopReason: i.stopReason,
    generation: {
      model: i.llmId,
      capability: i.capability,
      promptVersion: i.promptVersion,
      attempts: i.attempts.length,
      usage: i.usage,
      perAttempt: i.attempts.map((a) => ({
        n: a.n,
        errors: a.issues.filter((x) => x.severity === 'error').length,
        warnings: a.issues.filter((x) => x.severity === 'warning').length,
        dryRunOk: a.dryRun ? a.dryRun.ok : null,
        toolCalls: a.toolCalls,
        draftError: a.draftError,
      })),
    },
    coverage: cov,
    mapping: i.test?.mapping,
    dryRun: r && {
      ok: i.test?.ok ?? false,
      pages: r.pages,
      cellsSet: r.cellsSet,
      cloned: r.cloned,
      imagesInserted: r.imagesInserted,
      failedChecks,
      warnings: r.warnings,
    },
    rationale: (i.rationale ?? []).map((x) => ({
      ...x,
      unverifiedEvidence: (x.evidence ?? []).filter((e) => !haystack.includes(e)),
    })),
    remainingIssues: i.issues,
  };
}

/** 사람이 읽는 검토 보고서 (Markdown) */
export function reviewToMarkdown(r: ReviewReport, yaml?: string): string {
  const L: string[] = [];
  const g = r.generation;
  L.push(`# 프로필 검토 보고서`, '');
  L.push(`- 결과: **${r.status === 'passed' ? '통과' : '미통과'}** (${r.stopReason})`);
  L.push(`- 모델: ${g.model} (능력 ${g.capability}), 프롬프트 ${g.promptVersion}`);
  L.push(`- 시도 ${g.attempts}회, 토큰 입력 ${g.usage.inputTokens} / 출력 ${g.usage.outputTokens}`);
  L.push('', '## 시도별 결과', '', '| # | 오류 | 경고 | 드라이런 | 도구 호출 | 비고 |', '|---|---|---|---|---|---|');
  for (const a of g.perAttempt)
    L.push(
      `| ${a.n} | ${a.errors} | ${a.warnings} | ${a.dryRunOk === null ? '-' : a.dryRunOk ? '통과' : '실패'} | ${a.toolCalls} | ${a.draftError ?? ''} |`,
    );

  L.push('', '## 커버리지 (프로그램 계산)', '');
  if (!r.coverage.tables.length) L.push('- 바인딩이 채우는 표가 없음');
  for (const t of r.coverage.tables) {
    L.push(
      `- 표 ${t.table}: 매핑 ${t.mapped.length}, '*' 확장 ${t.viaWildcard.length}, **미매핑 ${t.unmapped.length}**${t.unmapped.length ? ` — ${t.unmapped.join(', ')}` : ''}`,
    );
  }
  L.push(`- 채우지 않는 누름틀: ${r.coverage.unmappedFields.length ? r.coverage.unmappedFields.join(', ') : '없음'}`);
  if (r.coverage.mdWarnings.length) L.push(`- 예제 md 경고: ${r.coverage.mdWarnings.join('; ')}`);

  if (r.dryRun) {
    L.push('', '## 드라이런 (예제 md 변환)', '');
    L.push(
      `- 자체 검증 ${r.dryRun.ok ? '통과' : '실패'}, ${r.dryRun.pages}쪽, 셀 ${r.dryRun.cellsSet}개 채움, 복제 ${r.dryRun.cloned}, 그림 ${r.dryRun.imagesInserted}`,
    );
    if (r.dryRun.failedChecks.length) L.push(`- 실패한 검증: ${r.dryRun.failedChecks.join(', ')}`);
    for (const w of r.dryRun.warnings) L.push(`- 경고: ${w}`);
  }
  if (r.mapping) {
    L.push('', '## 매핑 대조표', '');
    for (const it of r.mapping.items) {
      L.push(`### ${it.id}`, '', '| 상태 | 라벨 | 값 |', '|---|---|---|');
      for (const row of it.rows)
        L.push(
          `| ${row.found ? '✔' : '✘ 양식에 없음'} | ${row.label} | ${row.value.replace(/\n/g, ' ⏎ ').replace(/\|/g, '\\|')} |`,
        );
      L.push('');
    }
  }
  if (r.rationale.length) {
    L.push(
      '## 근거 (LLM 설명, 인용은 프로그램이 확인)',
      '',
      '| 위치 | 이유 | 확신 | 확인 안 된 인용 |',
      '|---|---|---|---|',
    );
    for (const x of r.rationale)
      L.push(
        `| ${x.path} | ${x.why.replace(/\|/g, '\\|')} | ${x.confidence ?? '-'} | ${x.unverifiedEvidence.length ? x.unverifiedEvidence.join('; ') : '-'} |`,
      );
    L.push('');
  }
  if (r.remainingIssues.length) {
    L.push('## 남은 점검 항목', '');
    for (const x of r.remainingIssues)
      L.push(
        `- [${x.severity}] \`${x.code}\` ${x.path || '(루트)'}${x.line ? `:${x.line}` : ''} — ${x.message}${x.candidates?.length ? ` (후보: ${x.candidates.join(', ')})` : ''}`,
      );
    L.push('');
  }
  if (yaml) L.push('## 프로필 초안', '', '```yaml', yaml.trimEnd(), '```', '');
  return L.join('\n');
}
