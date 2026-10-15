import { useEffect, useMemo, useRef, useState } from 'react';
import { createEditor, type RhwpEditor } from '@rhwp/editor';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Chip,
  CssBaseline,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from '@mui/material';
import {
  checkProfile,
  convertBytes,
  type ConvertReport,
  type Issue,
  type MappingPreview,
  parseProfile,
  type Profile,
  previewMapping,
  ProfileError,
  readMarkdown,
  validateData,
  ValidationError,
} from '@yangsik/core';
import { engine, registerFont, renderDiagram, setDiagramFont } from './browser';
import { DOCTYPES, loadTemplateBytes } from './doctypes';
import { MappingPanel, ProfileIssues, ReportPanel, Section } from './panels';

const theme = createTheme({ palette: { primary: { main: '#1d4ed8' } }, typography: { fontSize: 13 } });
/** MUI 내부 입력 요소에 시험용 식별자를 붙인다 */
const tid = (id: string) => ({ 'data-testid': id }) as Record<string, string>;

type View = 'template' | 'result';

export function App() {
  const first = DOCTYPES[0];
  const [doctypeId, setDoctypeId] = useState(first?.id ?? '');
  const doctype = DOCTYPES.find((d) => d.id === doctypeId) ?? first;
  const [profile, setProfile] = useState<Profile>(first.profile);
  const [profileNote, setProfileNote] = useState('내장 프로필');
  const [dataSchema, setDataSchema] = useState<object | undefined>(first.schema);
  const [md, setMd] = useState(first.example);
  const [template, setTemplate] = useState<Uint8Array | null>(null);
  const [templateName, setTemplateName] = useState(`${first.id}/template.hwpx (내장 합성 양식)`);
  const [mapping, setMapping] = useState<MappingPreview | null>(null);
  const [profileIssues, setProfileIssues] = useState<Issue[]>([]);
  const [violations, setViolations] = useState<string[]>([]);
  const [report, setReport] = useState<ConvertReport | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  /** 최종 변환에서 만든 HWP 5.0(자체 검증을 통과한 경우만) */
  const [resultHwp, setResultHwp] = useState<Uint8Array | null>(null);
  const [view, setView] = useState<View>('template');
  const [open, setOpen] = useState({ mapping: true, report: true, profile: false });
  const [status, setStatus] = useState('양식 불러오는 중…');
  const [fonts, setFonts] = useState<string[]>([]);
  const [localFontDialog, setLocalFontDialog] = useState(false);
  const [auto, setAuto] = useState(true);
  const seq = useRef(0);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Promise<RhwpEditor> | null>(null);

  // 문서 유형을 바꾸면 프로필·규약·예제·양식을 그 유형 것으로 바꾼다
  useEffect(() => {
    setProfile(doctype.profile);
    setProfileNote('내장 프로필');
    setDataSchema(doctype.schema);
    setMd(doctype.example);
    setTemplateName(`${doctype.id}/template.hwpx (내장 합성 양식)`);
    setResult(null);
    setResultHwp(null);
    setReport(null);
    setViolations([]);
    setView('template');
    setTemplate(null);
    void loadTemplateBytes(doctype.templateUrl).then(setTemplate);
  }, [doctype]);

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
      const ed = await editor.current;
      if (!ed) return;
      const r = await ed.loadFile(bytes.slice().buffer, name, { suppressDialogs: !localFontDialog });
      setStatus(`에디터 로드 완료 (${r.pageCount}쪽)`);
    } catch (e) {
      setStatus(`에디터 로드 실패: ${(e as Error).message}`);
    }
  };

  useEffect(() => {
    if (template && view === 'template') void show(template, 'template.hwpx');
  }, [template, view]);

  // 프로필·양식이 바뀌면 점검한다(양식 대조)
  useEffect(() => {
    if (!template) return;
    checkProfile(engine, profile, template, { dataSchema })
      .then((r) => setProfileIssues(r.issues))
      .catch((e) => setStatus(`프로필 점검 실패: ${(e as Error).message}`));
  }, [profile, template, dataSchema]);

  // md·프로필이 바뀌면 매핑을 갱신한다
  useEffect(() => {
    if (!template) return;
    previewMapping(engine, profile, md, template)
      .then(setMapping)
      .catch((e) => setStatus(`매핑 실패: ${(e as Error).message}`));
  }, [md, template, profile]);

  // 입력 중 규약 검사는 엔진 없이 즉시 한다
  const live = useMemo(() => {
    const r = readMarkdown(profile, md);
    const all = [...r.violations, ...(dataSchema ? validateData(r.data, dataSchema, r.lines, r.violations) : [])].sort(
      (a, z) => a.line - z.line,
    );
    return all.map((v) => `input.md:${v.line}  ${v.path}  ${v.message}`);
  }, [md, profile, dataSchema]);

  /** full=true: Mermaid 렌더까지 포함한 최종 변환, false: 빠른 미리보기(그림 제외) */
  const run = async (full: boolean) => {
    if (!template) return;
    const my = ++seq.current;
    setStatus(full ? '변환 중…' : '미리보기 갱신 중…');
    try {
      const out = await convertBytes(engine, {
        mdName: 'input.md',
        profile,
        mdText: md,
        template,
        dataSchema,
        renderDiagram: full ? renderDiagram : undefined,
        skipDiagrams: !full, // 빠른 미리보기는 그림을 명시적으로 생략한다
        preview: false,
        formats: full ? ['hwpx', 'hwp'] : ['hwpx'],
      });
      if (my !== seq.current) return; // 더 최근 요청이 있으면 버린다
      setViolations([]);
      setReport(out.report);
      setResult(out.bytes);
      setResultHwp(out.hwp && out.report.hwp?.ok ? out.hwp : null);
      setView('result');
      await show(out.bytes, 'result.hwpx');
      setStatus(
        `${full ? '변환 완료' : '미리보기 완료(Mermaid 그림 제외)'} — 자체 검증 ${out.report.verify.ok ? '통과' : '실패'}${out.report.hwp ? `, HWP ${out.report.hwp.ok ? '통과' : '실패'}` : ''}`,
      );
    } catch (e) {
      if (my !== seq.current) return;
      if (e instanceof ValidationError) {
        setViolations(e.violations.map((v) => `input.md:${v.line}  ${v.path}  ${v.message}`));
        setStatus(`규약 위반 ${e.violations.length}건`);
      } else if (e instanceof ProfileError) {
        setProfileIssues(e.issues);
        setOpen((o) => ({ ...o, profile: true }));
        setStatus(`프로필 오류: ${e.issues.map((i) => i.message).join(' / ')}`);
      } else setStatus(`변환 실패: ${(e as Error).message}`);
    }
  };

  // md·프로필·양식이 바뀌면 잠시 뒤 자동으로 빠른 미리보기를 돌린다
  // biome-ignore lint/correctness/useExhaustiveDependencies: run은 매 렌더 새로 만들어지며 입력 변경만 트리거로 쓴다
  useEffect(() => {
    if (!auto || !template) return;
    const t = setTimeout(() => void run(false), 800);
    return () => clearTimeout(t);
  }, [md, template, profile, auto]);

  const loadTemplate = async (file: File | undefined) => {
    if (!file) return;
    setTemplate(new Uint8Array(await file.arrayBuffer()));
    setTemplateName(file.name);
    setResult(null);
    setResultHwp(null);
    setReport(null);
    setView('template');
  };
  const loadProfile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseProfile(await file.text());
    if (!parsed.profile) {
      setProfileIssues(parsed.issues);
      setOpen((o) => ({ ...o, profile: true }));
      setStatus(`프로필 문법·스키마 오류 ${parsed.issues.length}건`);
      return;
    }
    setProfile(parsed.profile);
    setProfileNote(`올린 프로필: ${file.name}`);
  };
  const loadSchema = async (file: File | undefined) => {
    if (file) setDataSchema(JSON.parse(await file.text()) as object);
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
      const ed = await editor.current;
      if (!ed) return;
      const bytes = await ed.exportHwpx();
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

  const shownViolations = violations.length ? violations : live;
  const errorCount = profileIssues.filter((i) => i.severity === 'error').length;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100vh' }}>
        <AppBar position="static" color="default" elevation={1}>
          <Toolbar variant="dense" sx={{ gap: 2 }}>
            <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
              yangsik
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Markdown → 양식 HWPX (변환은 이 브라우저 안에서만 수행)
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Select
              size="small"
              value={doctypeId}
              onChange={(e) => setDoctypeId(e.target.value)}
              inputProps={tid('doctype')}
            >
              {DOCTYPES.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.profile.name ?? d.profile.type} ({d.id})
                </MenuItem>
              ))}
            </Select>
          </Toolbar>
        </AppBar>

        <Box sx={{ display: 'grid', gridTemplateColumns: '460px 1fr', minHeight: 0 }}>
          <Box sx={{ overflow: 'auto', p: 1.5, borderRight: 1, borderColor: 'divider' }}>
            <Stack spacing={1.5}>
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle2" gutterBottom>
                  양식·프로필
                </Typography>
                <Typography variant="body2" data-testid="template-name">
                  {templateName}
                </Typography>
                <Typography variant="caption" color="text.secondary" data-testid="profile-note">
                  {profileNote}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mt: 1 }} useFlexGap>
                  <Button component="label" size="small" variant="outlined">
                    양식(.hwpx)
                    <input
                      hidden
                      type="file"
                      accept=".hwpx"
                      onChange={(e) => void loadTemplate(e.target.files?.[0])}
                      {...tid('tplfile')}
                    />
                  </Button>
                  <Button component="label" size="small" variant="outlined">
                    프로필(.yaml)
                    <input
                      hidden
                      type="file"
                      accept=".yaml,.yml"
                      onChange={(e) => void loadProfile(e.target.files?.[0])}
                      {...tid('profilefile')}
                    />
                  </Button>
                  <Button component="label" size="small" variant="outlined">
                    규약(.json)
                    <input
                      hidden
                      type="file"
                      accept=".json"
                      onChange={(e) => void loadSchema(e.target.files?.[0])}
                      {...tid('schemafile')}
                    />
                  </Button>
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2">Markdown</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => setMd(doctype.example)}>
                      예제
                    </Button>
                    <Button component="label" size="small" variant="outlined">
                      파일
                      <input
                        hidden
                        type="file"
                        accept=".md,.markdown,.txt"
                        onChange={(e) => void loadMd(e.target.files?.[0])}
                        {...tid('mdfile')}
                      />
                    </Button>
                  </Stack>
                </Stack>
                <TextField
                  multiline
                  fullWidth
                  minRows={10}
                  maxRows={18}
                  value={md}
                  onChange={(e) => setMd(e.target.value)}
                  slotProps={{ htmlInput: { ...tid('md'), style: { fontFamily: 'monospace', fontSize: 12 } } }}
                  sx={{ mt: 1 }}
                />
                {shownViolations.length > 0 ? (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      규약 위반 {shownViolations.length}건
                    </Typography>
                    <pre data-testid="violations" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                      {shownViolations.join('\n')}
                    </pre>
                  </Alert>
                ) : (
                  <Alert severity="success" sx={{ mt: 1 }}>
                    규약 검사 통과
                  </Alert>
                )}
              </Paper>

              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => void run(true)}
                    disabled={!template}
                    {...tid('convert')}
                  >
                    변환(Mermaid 포함)
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => result && saveBlob(result, 'result.hwpx')}
                    disabled={!result}
                    {...tid('download')}
                  >
                    변환 결과 저장
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => resultHwp && saveBlob(resultHwp, 'result.hwp')}
                    disabled={!resultHwp}
                    {...tid('download-hwp')}
                  >
                    HWP 저장
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => void exportFromEditor()} {...tid('export')}>
                    에디터 내용 내보내기
                  </Button>
                </Stack>
                <FormControlLabel
                  sx={{ display: 'block', mt: 0.5 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={auto}
                      onChange={(e) => setAuto(e.target.checked)}
                      slotProps={{ input: tid('auto') }}
                    />
                  }
                  label="자동 미리보기 (입력 후 0.8초, Mermaid 제외)"
                />
                <Typography variant="body2" data-testid="status" sx={{ mt: 0.5 }}>
                  {status}
                </Typography>
              </Paper>

              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle2" gutterBottom>
                  글꼴 (Mermaid 그림용, 이 탭의 메모리에만 둠)
                </Typography>
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  onChange={(e) => void addFont(e.target.files?.[0])}
                  {...tid('font')}
                />
                {fonts.length > 0 && <div data-testid="fonts">등록: {fonts.join(', ')}</div>}
                <FormControlLabel
                  sx={{ display: 'block' }}
                  control={
                    <Checkbox
                      size="small"
                      checked={localFontDialog}
                      onChange={(e) => setLocalFontDialog(e.target.checked)}
                      slotProps={{ input: tid('localfont') }}
                    />
                  }
                  label="에디터 로컬 글꼴 안내창 표시"
                />
              </Paper>

              <Section title="양식 매핑" open={open.mapping} onToggle={(v) => setOpen((o) => ({ ...o, mapping: v }))}>
                <MappingPanel mapping={mapping} />
              </Section>
              <Section title="변환 보고" open={open.report} onToggle={(v) => setOpen((o) => ({ ...o, report: v }))}>
                <ReportPanel report={report} />
              </Section>
              <Section
                title="프로필 점검"
                badge={
                  profileIssues.length > 0 ? (
                    <Chip size="small" color={errorCount ? 'error' : 'warning'} label={profileIssues.length} />
                  ) : undefined
                }
                open={open.profile}
                onToggle={(v) => setOpen((o) => ({ ...o, profile: v }))}
              >
                <ProfileIssues issues={profileIssues} />
              </Section>
            </Stack>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Tabs
              value={view}
              onChange={(_, v: View) => {
                setView(v);
                if (v === 'result' && result) void show(result, 'result.hwpx');
              }}
              sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
            >
              <Tab value="template" label="양식" sx={{ minHeight: 36 }} />
              <Tab value="result" label="결과" disabled={!result} sx={{ minHeight: 36 }} />
            </Tabs>
            <Box ref={host} data-testid="editor" sx={{ flex: 1, minHeight: 0 }} />
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
