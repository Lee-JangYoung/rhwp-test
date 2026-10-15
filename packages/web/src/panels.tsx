import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material';
import type { ConvertReport, Issue, MappingPreview } from '@yangsik/core';
import type { ReactNode } from 'react';

/** 접을 수 있는 구역(접어도 내용은 DOM에 남는다) */
export function Section(p: {
  title: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Accordion disableGutters variant="outlined" expanded={p.open} onChange={(_, v) => p.onToggle(v)}>
      <AccordionSummary>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle2">{p.title}</Typography>
          {p.badge}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>{p.children}</AccordionDetails>
    </Accordion>
  );
}

/** 양식 라벨 ↔ md 값 대조표 */
export function MappingPanel({ mapping }: { mapping: MappingPreview | null }) {
  if (!mapping) return <Typography variant="body2">양식을 읽는 중…</Typography>;
  return (
    <Box data-testid="mapping">
      <Typography variant="body2">양식 라벨: {mapping.templateLabels.join(', ') || '(없음)'}</Typography>
      {mapping.unusedLabels.length > 0 && (
        <Alert severity="warning" sx={{ my: 1 }}>
          md에 값이 없는 라벨(비움): {mapping.unusedLabels.join(', ')}
        </Alert>
      )}
      {mapping.items.map((it) => {
        const missing = it.rows.filter((r) => !r.found).length;
        return (
          <Accordion key={it.id} disableGutters variant="outlined">
            <AccordionSummary>
              <Typography variant="body2" component="div">
                {it.id} {missing > 0 && <Chip size="small" color="error" label={`${missing} 누락`} />}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Table size="small">
                <TableBody>
                  {it.rows.map((r) => (
                    <TableRow key={r.label} sx={{ color: r.found ? undefined : 'error.main' }}>
                      <TableCell sx={{ width: 90 }}>{r.found ? '✔' : '✘ 양식에 없음'}</TableCell>
                      <TableCell>{r.label}</TableCell>
                      <TableCell sx={{ whiteSpace: 'pre-wrap' }}>{r.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}

/** 변환 보고: 요약 + 실패한 자체 검증 + 전체 JSON */
export function ReportPanel({ report }: { report: ConvertReport | null }) {
  if (!report) return <Typography variant="body2">아직 변환하지 않았습니다.</Typography>;
  const failed = report.verify.checks.filter((c) => !c.ok);
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Chip
          size="small"
          color={report.verify.ok ? 'success' : 'error'}
          label={`자체 검증 ${report.verify.ok ? '통과' : '실패'}`}
        />
        <Chip size="small" label={`${report.pages}쪽`} />
        <Chip size="small" label={`항목 ${report.items}`} />
        <Chip size="small" label={`그림 ${report.imagesInserted}`} />
      </Stack>
      {failed.map((c) => (
        <Alert key={c.name} severity="error">
          {c.name}
          {c.detail ? ` — ${c.detail}` : ''}
        </Alert>
      ))}
      {report.warnings.map((w) => (
        <Alert key={w} severity="warning">
          {w}
        </Alert>
      ))}
      <pre data-testid="report" style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>
        {JSON.stringify({ ...report, verify: { ok: report.verify.ok, failed } }, null, 1)}
      </pre>
    </Stack>
  );
}

/** 프로필 점검 결과: 코드·위치·후보 */
export function ProfileIssues({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return <Alert severity="success">프로필이 양식과 맞습니다.</Alert>;
  return (
    <Stack spacing={1} data-testid="profile-issues">
      {issues.map((i, n) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 점검 항목은 순서가 곧 식별이다
        <Alert key={n} severity={i.severity === 'error' ? 'error' : 'warning'}>
          <Typography variant="body2">
            <b>{i.code}</b> {i.path || '(루트)'}
            {i.line ? `:${i.line}` : ''} — {i.message}
            {i.candidates?.length ? ` (후보: ${i.candidates.join(', ')})` : ''}
          </Typography>
        </Alert>
      ))}
    </Stack>
  );
}
