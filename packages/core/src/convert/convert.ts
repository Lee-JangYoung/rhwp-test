import type { DocumentEngine, TableRef } from '../engine/types';
import { readMarkdown } from '../markdown/read';
import { formatViolations, validateData, type Violation } from '../markdown/validate';
import { checkProfile } from '../profile/check';
import type { Issue } from '../profile/issues';
import type { Binding, Locator, Policy, Profile, ValueSpec } from '../profile/types';
import { type LabelOptions, labelCells } from './blocks';
import { findTables } from './resolve';
import { getPath, type Scopes, resolveValue } from './values';
import { type Expected, type VerifyReport, verifyOutput } from './verify';

/** md가 프로필의 md 규칙·규약(JSON Schema)과 맞지 않음. 줄 번호와 함께 LLM에 되돌려 고치게 한다. */
export class ValidationError extends Error {
  constructor(
    public violations: Violation[],
    file: string,
  ) {
    super(`규약 위반 ${violations.length}건\n${formatViolations(file, violations)}`);
  }
}

/** 프로필이 양식과 맞지 않거나(점검 실패) 변환 중 오류가 확인됨. 구조화된 항목(코드·경로·후보)을 가진다. */
export class ProfileError extends Error {
  constructor(public issues: Issue[]) {
    super(
      `프로필 오류 ${issues.length}건\n${issues
        .map(
          (i) =>
            `  [${i.code}] ${i.path}${i.line ? ` (프로필 ${i.line}줄)` : ''} ${i.message}${i.candidates?.length ? ` — 후보: ${i.candidates.slice(0, 3).join(', ')}` : ''}`,
        )
        .join('\n')}`,
    );
  }
}

/** Mermaid 소스 → PNG. 환경별(Node: mermaid-cli, 브라우저: mermaid)로 주입한다. */
export interface RenderedDiagram {
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  ms: number;
}
export type DiagramRenderer = (source: string, name: string) => Promise<RenderedDiagram>;

export interface ConvertInput {
  /** 오류 메시지에 쓰는 md 파일 이름 */
  mdName?: string;
  mdText: string;
  template: Uint8Array;
  /** 프로필(parseProfile의 결과). 변환 전에 checkProfile을 실행한다 */
  profile: Profile;
  /** md 규약(JSON Schema). 프로필의 `schema` 파일 내용 */
  dataSchema?: object;
  /** 없으면 다이어그램이 필요한 항목에서 policy.onMissingRenderer를 따른다 */
  renderDiagram?: DiagramRenderer;
  /** true면 diagrams 바인딩을 명시적으로 건너뛴다(렌더·삽입 없음) */
  skipDiagrams?: boolean;
  /** 프로필의 output을 덮어쓴다(시험·미리보기용) */
  output?: Partial<Omit<Profile['output'], 'diagram'>>;
  /** true면 쪽별 SVG를 만든다 */
  preview?: boolean;
}

export interface ConvertReport {
  items: number;
  fieldsSet: Record<string, boolean>;
  cloned: number;
  cellsSet: number;
  imagesInserted: number;
  diagrams: { name: string; ms: number; widthPx: number; heightPx: number }[];
  warnings: string[];
  /** 변환 중 확인된 프로필 관련 항목(경고 수준) */
  issues: Issue[];
  pages: number;
  verify: VerifyReport;
  timingsMs: Record<string, number>;
}

const severity = (p: Policy): Issue['severity'] | null => (p === 'ignore' ? null : p === 'warn' ? 'warning' : 'error');

/** 항목의 이름: 제목 패턴의 첫 캡처 값(데이터 노드는 캡처를 먼저 담는다). 그림 설명 등에 쓴다 */
const firstCapture = (item: Record<string, unknown>): string | undefined =>
  Object.values(item).find((v): v is string => typeof v === 'string');

export async function convertBytes(
  engine: DocumentEngine,
  o: ConvertInput,
): Promise<{ bytes: Uint8Array; report: ConvertReport; previews: string[] }> {
  const mdName = o.mdName ?? 'input.md';
  const { profile } = o;
  const timings: Record<string, number> = {};
  const lap = (k: string, t0: number) => {
    timings[k] = Date.now() - t0;
  };
  const warnings: string[] = [];
  const issues: Issue[] = [];
  const output = { ...profile.output, ...o.output };

  // 1) 프로필 점검: 프로필이 양식과 맞지 않으면 변환하지 않는다
  let t0 = Date.now();
  const check = await checkProfile(engine, profile, o.template, { dataSchema: o.dataSchema });
  const checkErrors = check.issues.filter((i) => i.severity === 'error');
  if (checkErrors.length) throw new ProfileError(checkErrors);
  for (const i of check.issues) warnings.push(`프로필 ${i.path}: ${i.message}`);
  lap('check', t0);

  // 2) md 읽기·검증: 구조(프로필의 md 규칙)가 먼저, 규약(JSON Schema)은 추가 제약
  t0 = Date.now();
  const md = readMarkdown(profile, o.mdText);
  for (const w of md.warnings) warnings.push(`${mdName}:${w.line} ${w.message}`);
  const violations = [
    ...md.violations,
    ...(o.dataSchema ? validateData(md.data, o.dataSchema, md.lines, md.violations) : []),
  ].sort((a, b) => a.line - b.line);
  lap('parse+validate', t0);
  if (violations.length) throw new ValidationError(violations, mdName);

  // 3) 양식 열기
  t0 = Date.now();
  const s = await engine.open(o.template);
  lap('open', t0);
  try {
    const fieldsSet: Record<string, boolean> = {};
    const expectedFields: Record<string, string> = {};
    const expectedBlocks: Expected['blocks'] = [];
    const splitTables: number[] = [];
    const pending: { table: number; name: string; sources: string[] }[] = [];
    let units = 0;
    let cloned = 0;
    let cellsSet = 0;
    const add = (
      code: Issue['code'],
      sev: Issue['severity'] | null,
      path: string,
      message: string,
      extra: Partial<Issue> = {},
    ) => {
      if (sev) issues.push({ code, severity: sev, path, message, ...extra });
    };

    /** 앞서 기록한 표 번호를 보정한다: at 뒤에 표 n개가 끼어들었다 */
    const shiftTables = (after: number, n: number) => {
      for (const b of expectedBlocks) if (b.table > after) b.table += n;
      for (let i = 0; i < splitTables.length; i++) if (splitTables[i] > after) splitTables[i] += n;
      for (const p of pending) if (p.table > after) p.table += n;
    };

    const run = (
      bindings: Binding[],
      scopes: Scopes,
      unit: { ref: TableRef; index: number } | null,
      base: string,
      unitName: string,
    ) => {
      bindings.forEach((b, i) => {
        const path = `${base}[${i}]`;
        switch (b.kind) {
          case 'fields': {
            for (const [data, name] of Object.entries((b.map ?? {}) as Record<string, string>)) {
              const v = getPath(scopes, data);
              const value = v === undefined || v === null ? '' : String(v);
              fieldsSet[name] = s.setField(name, value);
              if (fieldsSet[name]) expectedFields[name] = value;
              else
                add(
                  'field-not-found',
                  severity(profile.policy.onMissingField),
                  `${path}.map.${data}`,
                  `양식에 없는 누름틀: ${name}`,
                  { actual: name },
                );
            }
            break;
          }
          case 'repeat': {
            const arr = (getPath(scopes, String(b.over)) ?? []) as Record<string, unknown>[];
            const found = findTables(s, b.unit as Locator) ?? [];
            if (found.length !== 1)
              throw new Error(`${path}.unit: 반복 단위(표)를 하나로 정할 수 없음 (${found.length}개)`);
            const proto = found[0];
            if (arr.length === 0) {
              if (b.onEmpty === 'keep') break;
              add('collection-empty', 'error', `${path}.over`, `반복할 항목이 없음: ${String(b.over)}`);
              break;
            }
            const before = s.topTables().length;
            const blocks: TableRef[] = [proto.ref];
            for (let k = 1; k < arr.length; k++) blocks.push(s.cloneTableAfter(proto.ref, blocks[k - 1]));
            const live = s.topTables();
            if (live.length !== before + arr.length - 1)
              throw new Error(`표 수 불일치: 기대 ${before + arr.length - 1} / 실제 ${live.length}`);
            if (arr.length > 1) shiftTables(proto.index, arr.length - 1);
            units += arr.length;
            cloned += arr.length - 1;
            arr.forEach((item, k) => {
              const ref = live[proto.index + k];
              run(
                (b.do ?? []) as Binding[],
                [item, ...scopes],
                { ref, index: proto.index + k },
                `${path}.do`,
                firstCapture(item) ?? `${String(b.over)}-${k + 1}`,
              );
              s.setTablePageBreak(ref, output.tablePageBreak);
              splitTables.push(proto.index + k);
            });
            break;
          }
          case 'cells': {
            let ref: TableRef | undefined;
            let index = -1;
            if (b.in) {
              const f = findTables(s, b.in as Locator) ?? [];
              if (f.length !== 1) throw new Error(`${path}.in: 표를 하나로 정할 수 없음 (${f.length}개)`);
              ref = f[0].ref;
              index = f[0].index;
            } else if (unit) {
              ref = unit.ref;
              index = unit.index;
            }
            if (!ref) throw new Error(`${path}: cells는 in 또는 repeat 안에서만 쓸 수 있음`);
            const lo: LabelOptions = {
              labelColumn: b.labelColumn as number | undefined,
              valueColumn: b.valueColumn as number | undefined,
              value: b.value as 'right' | 'below' | undefined,
            };
            const lc = labelCells(s, ref, lo);
            const map = (b.map ?? {}) as Record<string, ValueSpec>;
            const entries: [string, string | undefined][] = [];
            for (const [label, spec] of Object.entries(map)) {
              if (label === '*') continue;
              entries.push([label, resolveValue(spec, scopes)]);
            }
            if ('*' in map) {
              const kv = getPath(scopes, String(map['*'])) as Record<string, string> | undefined;
              for (const [k, v] of Object.entries(kv ?? {})) if (!(k in map)) entries.push([k, v]);
            }
            const want: Record<string, string> = {};
            for (const [label, value] of entries) {
              const cell = lc.get(label);
              if (!cell) {
                add(
                  'label-not-found',
                  severity(profile.policy.onMissingLabel),
                  `${path}.map.${label}`,
                  `표에 없는 라벨: ${label}`,
                  { actual: label },
                );
                continue;
              }
              if (value === undefined) continue;
              s.setCellText(ref, cell.idx, value);
              want[label] = value;
              cellsSet++;
            }
            if ((b.unmappedValue ?? 'clear') === 'clear') {
              for (const [label, cell] of lc) {
                if (!(label in want)) {
                  s.setCellText(ref, cell.idx, '');
                  want[label] = '';
                }
              }
            }
            // 검증 순서는 매핑 순서가 아니라 양식 안의 라벨 순서로 고정한다 (프로필 항목 순서와 무관한 결과)
            const ordered: Record<string, string> = {};
            for (const label of lc.keys()) if (label in want) ordered[label] = want[label];
            expectedBlocks.push({ table: index, values: ordered, labels: lo });
            break;
          }
          case 'diagrams': {
            if (o.skipDiagrams || !unit) break;
            const sources = (getPath(scopes, String(b.from)) ?? []) as string[];
            if (sources.length === 0) break;
            if (!o.renderDiagram) {
              add('renderer-missing', severity(profile.policy.onMissingRenderer), path, '다이어그램 렌더러가 없음');
              break;
            }
            pending.push({ table: unit.index, name: unitName, sources });
            break;
          }
        }
      });
    };

    t0 = Date.now();
    const scopes: Scopes = [md.data];
    run(profile.bindings, scopes, null, 'bindings', 'doc');
    const errs = issues.filter((x) => x.severity === 'error');
    if (errs.length) throw new ProfileError(errs);
    if (output.fitHeights) s.fitTableHeights();
    lap('fill', t0);

    // 4) 다이어그램 → 그림. 뒤쪽 단위부터 넣어 앞쪽 문단 번호가 밀리지 않게 한다.
    t0 = Date.now();
    let imagesInserted = 0;
    const diagrams: ConvertReport['diagrams'] = [];
    if (pending.length && o.renderDiagram) {
      const rendered: { table: number; list: RenderedDiagramEntry[] }[] = [];
      for (const p of pending) {
        const list: RenderedDiagramEntry[] = [];
        for (const [k, src] of p.sources.entries()) {
          const name = `${p.name}-${k + 1}`;
          const r = await o.renderDiagram(src, name);
          diagrams.push({ name, ms: r.ms, widthPx: r.widthPx, heightPx: r.heightPx });
          list.push({ ...r, alt: p.name });
        }
        rendered.push({ table: p.table, list });
      }
      for (const r of [...rendered].sort((a, b) => b.table - a.table)) {
        const ref = s.topTables()[r.table];
        for (const d of [...r.list].reverse()) {
          s.insertImageAfter(ref, {
            bytes: d.bytes,
            widthPx: d.widthPx,
            heightPx: d.heightPx,
            alt: `${d.alt} 다이어그램`,
          });
          imagesInserted++;
        }
      }
    }
    lap('mermaid+images', t0);

    // 5) 저장
    t0 = Date.now();
    const preCounts = s.controlCounts();
    const tableCount = s.topTables().length;
    const bytes = s.export();
    lap('export', t0);
    const previews: string[] = [];
    if (o.preview) for (let p = 0; p < s.pageCount(); p++) previews.push(s.renderSvg(p));

    // 6) 자체 검증: 저장 파일을 다시 열어 확인
    t0 = Date.now();
    const expected: Expected = {
      fields: expectedFields,
      blocks: expectedBlocks,
      tableCount,
      splitTables,
      images: imagesInserted,
      tableSplit: output.tablePageBreak,
      preExportCounts: preCounts,
    };
    const verify = await verifyOutput(engine, bytes, expected);
    lap('verify', t0);

    for (const i of issues) warnings.push(`프로필 ${i.path}: ${i.message}`);
    const report: ConvertReport = {
      items: units,
      fieldsSet,
      cloned,
      cellsSet,
      imagesInserted,
      diagrams,
      warnings,
      issues,
      pages: s.pageCount(),
      verify,
      timingsMs: timings,
    };
    return { bytes, report, previews };
  } finally {
    s.dispose();
  }
}

interface RenderedDiagramEntry extends RenderedDiagram {
  alt: string;
}
