import type { DocumentEngine, TableRef } from '../engine/types';
import { readMarkdown } from '../markdown/read';
import { formatViolations, validateData, type Violation } from '../markdown/validate';
import { checkProfile } from '../profile/check';
import { closest, type Issue } from '../profile/issues';
import type { Binding, Format, Locator, Policy, Profile, ValueSpec } from '../profile/types';
import { duplicateLabels, type LabelOptions, labelCells } from './blocks';
import { formatValue, getPath, type Scopes, resolveValue } from './values';
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
  const plan = check.plan;
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
    let units = 0;
    let cloned = 0;
    let cellsSet = 0;
    let rowOps = false;
    const add = (
      code: Issue['code'],
      sev: Issue['severity'] | null,
      path: string,
      message: string,
      extra: Partial<Issue> = {},
    ) => {
      if (sev) issues.push({ code, severity: sev, path, message, ...extra });
    };

    // 표 위치는 번호(본문 표 순서)이므로 표를 만들거나 지울 때 밀린다. 객체로 추적해 한꺼번에 보정한다.
    const tracked: TRef[] = [];
    const track = (index: number, orig?: number): TRef => {
      const t: TRef = { index, removed: false, orig };
      tracked.push(t);
      return t;
    };
    const shift = (after: number, n: number) => {
      for (const t of tracked) if (!t.removed && t.index > after) t.index += n;
    };
    const refOf = (t: TRef): TableRef => s.topTables()[t.index];
    // 바깥(repeat 밖)의 표는 양식의 원래 표(번호 = 양식 기준)다. 같은 표는 항상 같은 객체라 삭제·채움 기록이 이어진다.
    const baseImages = s.controlCounts().gso ?? 0;
    const baseFloating = s.pictureLayouts().filter((l) => !l.treatAsChar).length;
    const rootRefs: TRef[] = s.topTables().map((_, i) => track(i, i));
    /**
     * 점검(checkProfile)이 풀어낸 표: 문맥(복제본)의 pos번째, 바깥이면 양식의 pos번째 표.
     * 실행은 위치 지정을 다시 해석하지 않는다(점검과 실행이 다른 표를 가리키는 일을 없앤다).
     */
    const slot = (unit: Unit | null, pos: number | undefined, at: string): TRef => {
      const t = (unit ? unit.slots : rootRefs)[pos ?? -1];
      if (!t) throw new Error(`${at}: 점검이 풀어낸 표 위치가 없음 (실행 계획 불일치)`);
      return t;
    };

    const expectedBlocks: { t: TRef; values: Record<string, string>; labels: LabelOptions }[] = [];
    const splitTables: TRef[] = [];
    const pending: { t: TRef; name: string; sources: string[] }[] = [];
    const expectedLists: { t: TRef; cells: { row: number; col: number; text: string }[] }[] = [];
    const filled = new Map<TRef, Set<string>>();
    const expectedTokens: string[] = [];
    const expectedParagraphs: string[][] = [];

    const run = (bindings: Binding[], scopes: Scopes, unit: Unit | null, base: string, unitName: string) => {
      bindings.forEach((b, i) => {
        const path = `${base}[${i}]`;
        switch (b.kind) {
          case 'fields': {
            for (const [data, name] of Object.entries((b.map ?? {}) as Record<string, string>)) {
              const v = getPath(scopes, data);
              if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                add(
                  'invalid-value',
                  'error',
                  `${path}.map.${data}`,
                  `누름틀에는 문자열·목록만 넣을 수 있음(객체): ${data}`,
                  { actual: data },
                );
                continue;
              }
              const value =
                v === undefined || v === null ? '' : Array.isArray(v) ? v.map(String).join(', ') : String(v);
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
            const range = plan.units.get(path);
            if (!range) throw new Error(`${path}.unit: 점검이 풀어낸 단위가 없음 (실행 계획 불일치)`);
            const protos = (unit ? unit.slots : rootRefs).slice(range.start, range.end + 1);
            if (arr.length === 0) {
              if (b.onEmpty === 'keep') break;
              if (b.onEmpty === 'remove') {
                for (const t of [...protos].sort((a, z) => z.index - a.index)) {
                  s.deleteTable(refOf(t));
                  t.removed = true;
                  shift(t.index, -1);
                }
                rowOps = true;
                break;
              }
              add('collection-empty', 'error', `${path}.over`, `반복할 항목이 없음: ${String(b.over)}`);
              break;
            }
            const m = protos.length;
            const first = protos[0].index;
            const last = protos[m - 1].index;
            const before = s.topTables().length;
            // 복제본은 마지막 표 뒤에 차례로 붙인다 (원본 표의 위치는 바뀌지 않는다)
            let tail = refOf(protos[m - 1]);
            for (let k = 1; k < arr.length; k++)
              for (let j = 0; j < m; j++) tail = s.cloneTableAfter(refOf(protos[j]), tail);
            const added = (arr.length - 1) * m;
            if (s.topTables().length !== before + added)
              throw new Error(`표 수 불일치: 기대 ${before + added} / 실제 ${s.topTables().length}`);
            if (added) shift(last, added);
            const copies: TRef[][] = arr.map((_, k) =>
              k === 0 ? protos : protos.map((_, j) => track(first + k * m + j)),
            );
            // 바깥 문맥(모든 조상)의 전체 목록(쪽 나눔·그림 위치용)에 복제본의 표도 넣는다. 위치 지정용 slots는 그대로다
            if (added)
              for (let p = unit; p; p = p.parent) {
                const at = p.all.indexOf(protos[m - 1]);
                if (at >= 0) p.all.splice(at + 1, 0, ...copies.slice(1).flat());
              }
            units += arr.length;
            cloned += arr.length - 1;
            // 뒤쪽 복제본부터 채운다: 안쪽 복제·삭제가 앞쪽 복제본의 위치를 바꾸지 않는다
            for (let k = arr.length - 1; k >= 0; k--) {
              const item = arr[k];
              const u: Unit = { slots: copies[k], all: [...copies[k]], parent: unit };
              run(
                (b.do ?? []) as Binding[],
                [item, ...scopes],
                u,
                `${path}.do`,
                firstCapture(item) ?? `${String(b.over)}-${k + 1}`,
              );
              for (const t of u.all) {
                if (t.removed) continue;
                s.setTablePageBreak(refOf(t), output.tablePageBreak);
                splitTables.push(t);
              }
            }
            break;
          }
          case 'cells': {
            const target = slot(unit, plan.tables.get(path), path);
            const ref = refOf(target);
            const lo: LabelOptions = {
              labelColumn: b.labelColumn as number | undefined,
              valueColumn: b.valueColumn as number | undefined,
              value: b.value as 'right' | 'below' | undefined,
            };
            const lc = labelCells(s, ref, lo);
            const dups = duplicateLabels(s, ref, lo);
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
              if (dups.has(label)) {
                add('label-ambiguous', 'error', `${path}.map.${label}`, `표에 같은 라벨이 여러 개: ${label}`, {
                  actual: label,
                });
                continue;
              }
              if (value === undefined) continue;
              s.setCellText(ref, cell.idx, value);
              want[label] = value;
              cellsSet++;
              // 같은 표를 앞서 채운 바인딩의 기대값을 이 값으로 바꾼다
              for (const e of expectedBlocks) if (e.t === target && label in e.values) e.values[label] = value;
              filled.get(target)?.add(label) ?? filled.set(target, new Set([label]));
            }
            if ((b.unmappedValue ?? 'clear') === 'clear') {
              for (const [label, cell] of lc) {
                // 앞선 바인딩이 채운 라벨은 지우지 않는다
                if (!(label in want) && !filled.get(target)?.has(label)) {
                  s.setCellText(ref, cell.idx, '');
                  want[label] = '';
                }
              }
            }
            // 검증 순서는 매핑 순서가 아니라 양식 안의 라벨 순서로 고정한다 (프로필 항목 순서와 무관한 결과)
            const ordered: Record<string, string> = {};
            for (const label of lc.keys()) if (label in want) ordered[label] = want[label];
            expectedBlocks.push({ t: target, values: ordered, labels: lo });
            break;
          }
          case 'rows': {
            const target = slot(unit, plan.tables.get(path), path);
            const ref = refOf(target);
            const headerRows = (b.headerRows as number | undefined) ?? 1;
            const r0 = headerRows + ((b.templateRow as number | undefined) ?? 0);
            const recs = (getPath(scopes, String(b.over)) ?? []) as Record<string, string>[];
            const columns = (b.columns ?? {}) as Record<string, ValueSpec>;
            const clearUnmapped = (b.unmappedValue ?? 'clear') === 'clear';
            const cells0 = s.tableCells(ref);
            const headerCells = cells0.filter((c) => c.row === headerRows - 1);
            const headerOf = new Map(headerCells.map((c) => [c.text.trim(), c.col]));
            const dupHeaders = new Set(
              headerCells.map((c) => c.text.trim()).filter((t, i, a) => t && a.indexOf(t) !== i),
            );
            const colOf = new Map<number, ValueSpec>();
            for (const [header, spec] of Object.entries(columns)) {
              if (dupHeaders.has(header.trim())) {
                add(
                  'label-ambiguous',
                  'error',
                  `${path}.columns.${header}`,
                  `표 머리행에 같은 머리글이 여러 개: ${header}`,
                  {
                    actual: header,
                  },
                );
                continue;
              }
              const col = headerOf.get(header.trim());
              if (col === undefined)
                add(
                  'label-not-found',
                  severity(profile.policy.onMissingLabel),
                  `${path}.columns.${header}`,
                  `표 머리행에 없는 머리글: ${header}`,
                  { actual: header, candidates: closest(header, [...headerOf.keys()]) },
                );
              else colOf.set(col, spec);
            }
            const allCols = [...new Set(cells0.filter((c) => c.row === r0).map((c) => c.col))];
            // 레코드가 참조하는 키가 실제 레코드에 있는지 (점검은 md의 표 머리글을 모르므로 여기서 확인)
            if (recs.length) {
              const known = new Set([...Object.keys(recs[0]), '#']);
              for (const [header, spec] of Object.entries(columns)) {
                const paths =
                  typeof spec === 'string' ? [...spec.matchAll(/\{([^{}]+)\}/g)].map((x) => x[1]) : [spec.from];
                // 머리글에 '.'가 있으면(No.) 경로 전체가 레코드의 키일 수 있다
                const heads = paths.map((p) => (known.has(p) ? p : p.split('.')[0]));
                for (const h of heads)
                  if (!known.has(h) && !scopes.some((sc) => Object.hasOwn(sc, h)))
                    add('path-unknown', 'error', `${path}.columns.${header}`, `레코드에 없는 키: ${h}`, {
                      actual: h,
                      candidates: closest(
                        h,
                        [...known].filter((k) => k !== '#'),
                      ),
                    });
              }
            }
            const exp: { row: number; col: number; text: string }[] = [];
            rowOps = true;
            if (recs.length === 0) {
              const mode = (b.onEmpty as string | undefined) ?? 'clear';
              if (mode === 'error')
                add('collection-empty', 'error', `${path}.over`, `행으로 채울 항목이 없음: ${String(b.over)}`);
              else if (mode === 'removeRow') s.deleteRow(ref, r0);
              else if (mode === 'clear')
                for (const col of allCols) {
                  const cell = cells0.find((c) => c.row === r0 && c.col === col);
                  if (cell) {
                    s.setCellText(ref, cell.idx, '');
                    exp.push({ row: r0, col, text: '' });
                  }
                }
            } else {
              s.insertRowsAfter(ref, r0, recs.length - 1);
              const cells = s.tableCells(ref);
              recs.forEach((rec, n) => {
                const sc: Scopes = [{ '#': String(n + 1) }, rec, ...scopes];
                for (const col of allCols) {
                  const spec = colOf.get(col);
                  if (!spec && !clearUnmapped) continue;
                  const cell = cells.find((c) => c.row === r0 + n && c.col === col);
                  if (!cell) {
                    if (spec)
                      add(
                        'merged-cell',
                        'error',
                        `${path}.columns`,
                        `${r0 + n}행 ${col}열에 셀이 없음(견본 행에 병합 셀이 있어 행 복제로 채울 수 없음)`,
                        {
                          actual: { row: r0 + n, col },
                        },
                      );
                    continue;
                  }
                  const text = spec ? (resolveValue(spec, sc) ?? '') : '';
                  s.setCellText(ref, cell.idx, text);
                  exp.push({ row: r0 + n, col, text });
                  if (spec) cellsSet++;
                }
              });
            }
            expectedLists.push({ t: target, cells: exp });
            break;
          }
          case 'remove': {
            const m = /^(empty|exists)\((.+)\)$/.exec(String(b.when));
            if (!m) throw new Error(`${path}.when: 해석할 수 없음`);
            const v = getPath(scopes, m[2]);
            const blank =
              v === undefined ||
              v === null ||
              v === '' ||
              (Array.isArray(v) && v.length === 0) ||
              (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
            if (m[1] === 'empty' ? !blank : blank) break;
            const target = b.target as Locator;
            rowOps = true;
            if (target.row) {
              const t = slot(unit, plan.tables.get(path), path);
              const ref = refOf(t);
              const label = (target.row.label ?? '').trim();
              const rows = [
                ...new Set(
                  s
                    .tableCells(ref)
                    .filter((c) => c.col === 0 && c.text.trim() === label)
                    .map((c) => c.row),
                ),
              ];
              if (rows.length === 0) {
                add(
                  'label-not-found',
                  severity(profile.policy.onMissingLabel),
                  `${path}.target.row.label`,
                  `표에 없는 라벨: ${label}`,
                  { actual: label },
                );
                break;
              }
              for (const r of rows.sort((a, z) => z - a)) s.deleteRow(ref, r);
              for (const e of expectedBlocks) if (e.t === t) delete e.values[label];
              for (const e of expectedLists) if (e.t === t) e.cells = [];
            } else {
              const t = slot(unit, plan.removeTables.get(path), path);
              if (!t.removed) {
                s.deleteTable(refOf(t));
                t.removed = true;
                shift(t.index, -1);
              }
            }
            break;
          }
          case 'text': {
            for (const [token, spec] of Object.entries((b.map ?? {}) as Record<string, ValueSpec>)) {
              const n = s.replaceText(`{{${token}}}`, resolveValue(spec, scopes) ?? '');
              if (n === 0)
                add(
                  'token-not-found',
                  severity(profile.policy.onMissingLabel),
                  `${path}.map.${token}`,
                  `양식에 없는 토큰: {{${token}}}`,
                  {
                    actual: token,
                  },
                );
              else expectedTokens.push(`{{${token}}}`);
            }
            break;
          }
          case 'paragraphs': {
            const marker = (b.at as Locator).paragraph?.text ?? '';
            const idx = s.findParagraph(marker);
            if (idx < 0) {
              add(
                'paragraph-not-found',
                severity(profile.policy.onMissingLabel),
                `${path}.at`,
                `양식에 없는 문단: ${marker}`,
                { actual: marker },
              );
              break;
            }
            const v = getPath(scopes, String(b.from));
            const blank = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
            const mode = (b.onEmpty as string | undefined) ?? 'clear';
            if (blank && mode === 'keep') break;
            if (blank && mode === 'error') {
              add('collection-empty', 'error', `${path}.from`, `문단으로 채울 값이 없음: ${String(b.from)}`);
              break;
            }
            const lines = blank ? [''] : formatValue(v, b.format as Format | undefined).split('\n');
            s.setParagraphLines(idx, lines);
            expectedParagraphs.push(lines);
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
            const live = unit.all.filter((t) => !t.removed);
            if (live.length) pending.push({ t: live[live.length - 1], name: unitName, sources });
            break;
          }
        }
      });
    };

    t0 = Date.now();
    const scopes: Scopes = [md.data];
    // 채우기는 한 배치로: 편집마다 조판을 다시 계산하면 문서가 커질수록 호출당 비용이 늘어난다(S-28)
    s.batch(() => run(profile.bindings, scopes, null, 'bindings', 'doc'));
    const errs = issues.filter((x) => x.severity === 'error');
    if (errs.length) throw new ProfileError(errs);
    if (output.fitHeights) s.fitTableHeights();
    lap('fill', t0);

    // 4) 다이어그램 → 그림. 뒤쪽 단위부터 넣어 앞쪽 문단 번호가 밀리지 않게 한다.
    t0 = Date.now();
    let imagesInserted = 0;
    const diagrams: ConvertReport['diagrams'] = [];
    const queue = pending.filter((p) => !p.t.removed).sort((a, z) => a.t.index - z.t.index);
    if (queue.length && o.renderDiagram) {
      const rendered: { table: number; list: RenderedDiagramEntry[] }[] = [];
      for (const p of queue) {
        const list: RenderedDiagramEntry[] = [];
        for (const [k, src] of p.sources.entries()) {
          const name = `${p.name}-${k + 1}`;
          const r = await o.renderDiagram(src, name);
          diagrams.push({ name, ms: r.ms, widthPx: r.widthPx, heightPx: r.heightPx });
          list.push({ ...r, alt: p.name });
        }
        rendered.push({ table: p.t.index, list });
      }
      s.batch(() => {
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
      });
    }
    lap('mermaid+images', t0);

    // 5) 저장
    t0 = Date.now();
    const preCounts = s.controlCounts();
    const tableCount = s.topTables().length;
    const rowCounts = rowOps ? s.analyze().tables.map((t) => t.rows) : undefined;
    const bytes = s.export();
    lap('export', t0);
    const previews: string[] = [];
    if (o.preview) for (let p = 0; p < s.pageCount(); p++) previews.push(s.renderSvg(p));

    // 6) 자체 검증: 저장 파일을 다시 열어 확인
    t0 = Date.now();
    const alive = (t: TRef) => !t.removed;
    const expected: Expected = {
      fields: expectedFields,
      // 위치순으로 모은다 (뒤쪽 복제본부터 채웠으므로 기록 순서와 다르다). 같은 표 안에서는 기록 순서 유지
      blocks: expectedBlocks
        .filter((e) => alive(e.t))
        .map((e, n) => ({ n, table: e.t.index, values: e.values, labels: e.labels }))
        .sort((a, z) => a.table - z.table || a.n - z.n)
        .map(({ n: _n, ...e }) => e),
      tokens: expectedTokens,
      paragraphs: expectedParagraphs,
      lists: expectedLists
        .filter((e) => alive(e.t) && e.cells.length)
        .map((e) => ({ table: e.t.index, cells: e.cells }))
        .sort((a, z) => a.table - z.table),
      rowCounts,
      tableCount,
      splitTables: [...new Set(splitTables.filter(alive).map((t) => t.index))].sort((a, z) => a - z),
      images: imagesInserted,
      baseImages,
      baseFloating,
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

/** 본문 표의 위치(번호). 표를 만들거나 지우면 실행기가 보정한다 */
interface TRef {
  index: number;
  removed: boolean;
  /** 양식의 원래 표 번호(바깥 문맥의 표만). 복제본은 없음 */
  orig?: number;
}

/** repeat의 복제본 하나가 가진 표들 (바인딩의 문맥) */
interface Unit {
  /** 이 복제본 자신의 표들(양식의 단위 안 순서). 계획의 위치(pos)는 이것을 가리킨다 */
  slots: TRef[];
  /** slots + 안쪽 repeat이 만든 복제 표(문서 순서). 쪽 나눔·그림 위치에 쓴다 */
  all: TRef[];
  parent: Unit | null;
}
