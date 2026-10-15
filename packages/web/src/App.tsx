import { useEffect, useRef, useState } from 'react';
import { createEditor, type RhwpEditor } from '@rhwp/editor';
import { convertBytes, type ConvertReport, type MappingPreview, previewMapping, ValidationError } from '@yangsik/core';
import mdSample from '../../../templates/usecase/example.md?raw';
import schema from '../../../templates/usecase/schema.json';
import templateUrl from '../../../templates/usecase/template.hwpx?url';
import { engine, registerFont, renderDiagram, setDiagramFont } from './browser';

type Tab = 'template' | 'result';

export function App() {
  const [md, setMd] = useState(mdSample);
  const [template, setTemplate] = useState<Uint8Array | null>(null);
  const [mapping, setMapping] = useState<MappingPreview | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [report, setReport] = useState<ConvertReport | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [tab, setTab] = useState<Tab>('template');
  const [status, setStatus] = useState('양식 불러오는 중…');
  const [fonts, setFonts] = useState<string[]>([]);
  const [localFontDialog, setLocalFontDialog] = useState(false);
  const [auto, setAuto] = useState(true);
  const [templateName, setTemplateName] = useState('usecase-synthetic.hwpx (내장 합성 양식)');
  const seq = useRef(0);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Promise<RhwpEditor> | null>(null);

  useEffect(() => {
    // Artifact 같은 제한 환경에서는 .hwpx를 파일로 올릴 수 없어 빌드 때 data: URL로 내장한다(fetch 없이 해독)
    const m = /^data:[^,]*;base64,(.*)$/.exec(templateUrl);
    if (m) setTemplate(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
    else fetch(templateUrl).then(async (r) => setTemplate(new Uint8Array(await r.arrayBuffer())));
  }, []);

  useEffect(() => {
    if (!host.current) return;
    const p = createEditor(host.current, { width: '100%', height: '100%' });
    editor.current = p;
    return () => {
      void p.then((e) => e.destroy()).catch(() => {});
      editor.current = null;
    };
  }, []);

  const show = async (bytes: Uint8Array, name: string) => {
    try {
      const r = await (await editor.current!).loadFile(bytes.slice().buffer, name, {
        suppressDialogs: !localFontDialog,
      });
      setStatus(`에디터 로드 완료 (${r.pageCount}쪽)`);
    } catch (e) {
      setStatus(`에디터 로드 실패: ${(e as Error).message}`);
    }
  };

  // 양식이 준비되면 에디터에 표시하고, md가 바뀌면 매핑·규약 위반을 갱신한다
  useEffect(() => {
    if (template && tab === 'template') void show(template, 'template.hwpx');
  }, [template, tab]);
  useEffect(() => {
    if (!template) return;
    previewMapping(engine, md, template)
      .then(setMapping)
      .catch((e) => setStatus(`매핑 실패: ${(e as Error).message}`));
  }, [md, template]);

  /** full=true: Mermaid 렌더까지 포함한 최종 변환, false: 빠른 미리보기(그림 제외) */
  const run = async (full: boolean) => {
    if (!template) return;
    const my = ++seq.current;
    setStatus(full ? '변환 중…' : '미리보기 갱신 중…');
    try {
      const out = await convertBytes(engine, {
        mdName: 'input.md',
        mdText: md,
        template,
        schema,
        renderDiagram: full ? renderDiagram : undefined,
        preview: false,
      });
      if (my !== seq.current) return; // 더 최근 요청이 있으면 버린다
      setViolations([]);
      setReport(out.report);
      setResult(out.bytes);
      setTab('result');
      await show(out.bytes, 'result.hwpx');
      setStatus(
        `${full ? '변환 완료' : '미리보기 완료(Mermaid 그림 제외)'} — 자체 검증 ${out.report.verify.ok ? '통과' : '실패'}`,
      );
    } catch (e) {
      if (my !== seq.current) return;
      if (e instanceof ValidationError) {
        setViolations(e.violations.map((v) => `input.md:${v.line}  ${v.path}  ${v.message}`));
        setStatus(`규약 위반 ${e.violations.length}건`);
      } else setStatus(`변환 실패: ${(e as Error).message}`);
    }
  };

  // md나 양식이 바뀌면 잠시 뒤 자동으로 빠른 미리보기를 돌린다
  useEffect(() => {
    if (!auto || !template) return;
    const t = setTimeout(() => void run(false), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md, template, auto]);

  const loadTemplate = async (file: File | undefined) => {
    if (!file) return;
    setTemplate(new Uint8Array(await file.arrayBuffer()));
    setTemplateName(file.name);
    setResult(null);
    setReport(null);
    setTab('template');
  };

  const loadMd = async (file: File | undefined) => {
    if (file) setMd(await file.text());
  };

  const saveBlob = (bytes: Uint8Array, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/hwp+zip' }));
    a.download = name;
    a.click();
  };

  /** 에디터에서 사람이 고친 내용까지 포함해 내보낸다(우리 변환 결과 저장과 다름) */
  const exportFromEditor = async () => {
    try {
      const bytes = await (await editor.current!).exportHwpx();
      const s = await engine.open(bytes);
      try {
        setStatus(
          `에디터 내보내기 완료 — ${bytes.length} bytes, 재로드 ${s.pageCount()}쪽, 표 ${s.topTables().length}개`,
        );
      } finally {
        s.dispose();
      }
      saveBlob(bytes, 'edited.hwpx');
    } catch (e) {
      setStatus(`에디터 내보내기 실패: ${(e as Error).message}`);
    }
  };

  const addFont = async (file: File | undefined) => {
    if (!file) return;
    const family = file.name.replace(/\.[^.]+$/, '');
    const data = new Uint8Array(await file.arrayBuffer());
    try {
      await registerFont({ family, data });
      setDiagramFont({ family, data });
      setFonts((f) => [...f, family]);
      setStatus(`글꼴 "${family}" 등록 (이 브라우저 탭의 메모리에만 있음, 새로 변환하면 Mermaid 그림에 적용)`);
    } catch (e) {
      setStatus(`글꼴 등록 실패: ${(e as Error).message}`);
    }
  };

  const download = () => result && saveBlob(result, 'result.hwpx');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', height: '100vh', font: '13px sans-serif' }}>
      <div style={{ overflow: 'auto', padding: 8, borderRight: '1px solid #ccc' }}>
        <h3 style={{ margin: '0 0 6px' }}>양식 (HWPX)</h3>
        <div data-testid="template-name">{templateName}</div>
        <input
          data-testid="tplfile"
          type="file"
          accept=".hwpx"
          onChange={(e) => void loadTemplate(e.target.files?.[0])}
        />
        <h3 style={{ margin: '8px 0 6px' }}>Markdown</h3>
        <input
          data-testid="mdfile"
          type="file"
          accept=".md,.markdown,.txt"
          onChange={(e) => void loadMd(e.target.files?.[0])}
        />
        <textarea
          data-testid="md"
          value={md}
          onChange={(e) => setMd(e.target.value)}
          style={{ width: '100%', height: 220, fontFamily: 'monospace' }}
        />
        <div style={{ margin: '6px 0' }}>
          <button type="button" data-testid="convert" onClick={() => void run(true)} disabled={!template}>
            변환(Mermaid 포함)
          </button>{' '}
          <button type="button" data-testid="download" onClick={download} disabled={!result}>
            변환 결과 저장
          </button>{' '}
          <button type="button" data-testid="export" onClick={() => void exportFromEditor()}>
            에디터 내용 내보내기
          </button>
          <div>
            <label>
              <input data-testid="auto" type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />{' '}
              자동 미리보기 (입력 후 0.8초, Mermaid 제외)
            </label>
          </div>
        </div>
        <div style={{ margin: '6px 0' }}>
          글꼴(.ttf/.otf/.woff2):{' '}
          <input
            data-testid="font"
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            onChange={(e) => void addFont(e.target.files?.[0])}
          />
          {fonts.length > 0 && <div data-testid="fonts">등록: {fonts.join(', ')}</div>}
          <label>
            <input
              data-testid="localfont"
              type="checkbox"
              checked={localFontDialog}
              onChange={(e) => setLocalFontDialog(e.target.checked)}
            />{' '}
            에디터 로컬 글꼴 안내창 표시
          </label>
        </div>
        <div data-testid="status">{status}</div>
        {violations.length > 0 && (
          <pre data-testid="violations" style={{ color: '#b00', whiteSpace: 'pre-wrap' }}>
            {violations.join('\n')}
          </pre>
        )}
        <h3>양식 매핑</h3>
        {mapping && (
          <div data-testid="mapping">
            <div>양식 라벨: {mapping.templateLabels.join(', ') || '(없음)'}</div>
            {mapping.unusedLabels.length > 0 && (
              <div style={{ color: '#b60' }}>md에 값이 없는 라벨(비움): {mapping.unusedLabels.join(', ')}</div>
            )}
            {mapping.items.map((it) => (
              <details key={it.id}>
                <summary>
                  {it.id} ({it.rows.filter((r) => !r.found).length} 누락)
                </summary>
                <table>
                  <tbody>
                    {it.rows.map((r) => (
                      <tr key={r.label} style={{ color: r.found ? undefined : '#b00' }}>
                        <td>{r.found ? '✔' : '✘ 양식에 없음'}</td>
                        <td>{r.label}</td>
                        <td style={{ whiteSpace: 'pre-wrap' }}>{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
        )}
        {report && (
          <>
            <h3>변환 보고</h3>
            <pre data-testid="report" style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(
                { ...report, verify: { ok: report.verify.ok, failed: report.verify.checks.filter((c) => !c.ok) } },
                null,
                1,
              )}
            </pre>
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: 4 }}>
          <button type="button" onClick={() => setTab('template')} disabled={tab === 'template'}>
            양식
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setTab('result');
              if (result) void show(result, 'result.hwpx');
            }}
            disabled={!result || tab === 'result'}
          >
            결과
          </button>
        </div>
        <div ref={host} data-testid="editor" style={{ flex: 1, minHeight: 0 }} />
      </div>
    </div>
  );
}
