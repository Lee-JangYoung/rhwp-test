import { useEffect, useRef, useState } from 'react';
import { createEditor, type RhwpEditor } from '@rhwp/editor';
import mdSample from '../../fixtures/md/usecase-ok.md?raw';
import templateUrl from '../../fixtures/templates/usecase-synthetic.hwpx?url';
import schema from '../../schemas/usecase.schema.json';
import { convertBytes, ValidationError, type ConvertReport } from '../../src/core';
import { engine, previewMapping, renderDiagram, type MappingPreview } from './browser';

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
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Promise<RhwpEditor> | null>(null);

  useEffect(() => {
    fetch(templateUrl).then(async (r) => setTemplate(new Uint8Array(await r.arrayBuffer())));
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
      const r = await (await editor.current!).loadFile(bytes.slice().buffer, name);
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
    previewMapping(md, template).then(setMapping).catch((e) => setStatus(`매핑 실패: ${(e as Error).message}`));
  }, [md, template]);

  const run = async () => {
    if (!template) return;
    setStatus('변환 중…');
    setViolations([]);
    try {
      const out = await convertBytes(engine, { mdName: 'input.md', mdText: md, template, schema, renderDiagram, preview: false });
      setReport(out.report);
      setResult(out.bytes);
      setTab('result');
      await show(out.bytes, 'result.hwpx');
      setStatus(`변환 완료 — 자체 검증 ${out.report.verify.ok ? '통과' : '실패'}`);
    } catch (e) {
      if (e instanceof ValidationError) {
        setViolations(e.violations.map((v) => `input.md:${v.line}  ${v.path}  ${v.message}`));
        setStatus(`규약 위반 ${e.violations.length}건`);
      } else setStatus(`변환 실패: ${(e as Error).message}`);
    }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([result.slice().buffer], { type: 'application/hwp+zip' }));
    a.download = 'result.hwpx';
    a.click();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', height: '100vh', font: '13px sans-serif' }}>
      <div style={{ overflow: 'auto', padding: 8, borderRight: '1px solid #ccc' }}>
        <h3 style={{ margin: '0 0 6px' }}>Markdown</h3>
        <textarea data-testid="md" value={md} onChange={(e) => setMd(e.target.value)} style={{ width: '100%', height: 220, fontFamily: 'monospace' }} />
        <div style={{ margin: '6px 0' }}>
          <button data-testid="convert" onClick={run} disabled={!template}>변환</button>{' '}
          <button data-testid="download" onClick={download} disabled={!result}>HWPX 저장</button>
        </div>
        <div data-testid="status">{status}</div>
        {violations.length > 0 && <pre data-testid="violations" style={{ color: '#b00', whiteSpace: 'pre-wrap' }}>{violations.join('\n')}</pre>}
        <h3>양식 매핑</h3>
        {mapping && (
          <div data-testid="mapping">
            <div>양식 라벨: {mapping.templateLabels.join(', ') || '(없음)'}</div>
            {mapping.unusedLabels.length > 0 && <div style={{ color: '#b60' }}>md에 값이 없는 라벨(비움): {mapping.unusedLabels.join(', ')}</div>}
            {mapping.items.map((it) => (
              <details key={it.id}>
                <summary>{it.id} ({it.rows.filter((r) => !r.found).length} 누락)</summary>
                <table>
                  <tbody>
                    {it.rows.map((r) => (
                      <tr key={r.label} style={{ color: r.found ? undefined : '#b00' }}>
                        <td>{r.found ? '✔' : '✘ 양식에 없음'}</td><td>{r.label}</td><td style={{ whiteSpace: 'pre-wrap' }}>{r.value}</td>
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
            <pre data-testid="report" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ ...report, verify: { ok: report.verify.ok, failed: report.verify.checks.filter((c) => !c.ok) } }, null, 1)}</pre>
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: 4 }}>
          <button onClick={() => setTab('template')} disabled={tab === 'template'}>양식</button>{' '}
          <button onClick={() => { setTab('result'); if (result) void show(result, 'result.hwpx'); }} disabled={!result || tab === 'result'}>결과</button>
        </div>
        <div ref={host} data-testid="editor" style={{ flex: 1, minHeight: 0 }} />
      </div>
    </div>
  );
}
