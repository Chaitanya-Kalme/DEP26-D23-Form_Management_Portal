'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Link from 'next/link';
import {
  Search, Eye, Download, ChevronDown, Filter,
  Loader2, AlertTriangle, CheckCircle, XCircle, Clock, FileStack,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  X, Settings2, FileText, Table2, Check,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type DisplayStatus = 'Accepted' | 'Pending' | 'Rejected' | 'Expired';
type ExportFormat = 'CSV' | 'PDF';
type SortOption = '' | 'date_desc' | 'date_asc' | 'name_asc' | 'status' | 'level';

interface Submission {
  id: string;
  studentName: string;
  email: string;
  formId: number;
  formTitle: string;
  submissionDate: string;
  deadline: string;
  isExpired: boolean;
  status: DisplayStatus;
  overallStatus: string;
  currentLevel: number;
  totalLevels: number;
  currentVerifier: string;
  currentVerifierRole: string;
}

interface Stats {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  expired: number;
}

interface FormOption {
  id: number;
  title: string;
}

interface ApiResponse {
  submissions: Submission[];
  stats: Stats;
  formOptions: FormOption[];
}

// ─── Export config types ───────────────────────────────────────────────────────

interface ColumnDef {
  key: keyof Submission;
  label: string;
  defaultOn: boolean;
  csvLabel?: string; // header label override for CSV
}

interface CsvOptions {
  includeHeader: boolean;
  includeStats: boolean;
  includeTimestamp: boolean;
  wrapValues: boolean;
  includeFiltersUsed: boolean;
}

interface PdfOptions {
  showHeader: boolean;
  includeStats: boolean;
  showFiltersContext: boolean;
  colorBadges: boolean;
  compactMode: boolean;
  showLevelBar: boolean;
  showVerifierRole: boolean;
}

interface ExportConfig {
  columns: Record<string, boolean>;
  groupByStatus: boolean;
  groupByForm: boolean;
  sortBy: SortOption;
  csvOptions: CsvOptions;
  pdfOptions: PdfOptions;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'studentName',       label: 'Student name',       defaultOn: true  },
  { key: 'email',             label: 'Email',              defaultOn: true  },
  { key: 'formTitle',         label: 'Form title',         defaultOn: true  },
  { key: 'submissionDate',    label: 'Submission date',    defaultOn: true  },
  { key: 'deadline',          label: 'Deadline',           defaultOn: false },
  { key: 'status',            label: 'Status',             defaultOn: true  },
  { key: 'overallStatus',     label: 'Overall status',     defaultOn: false },
  { key: 'currentLevel',      label: 'Current level',      defaultOn: true  },
  { key: 'totalLevels',       label: 'Total levels',       defaultOn: false },
  { key: 'currentVerifier',   label: 'Current verifier',   defaultOn: true  },
  { key: 'currentVerifierRole', label: 'Verifier role',    defaultOn: false },
  { key: 'isExpired',         label: 'Is expired',         defaultOn: false },
];

const DEFAULT_CSV_OPTIONS: CsvOptions = {
  includeHeader: true,
  includeStats: true,
  includeTimestamp: true,
  wrapValues: false,
  includeFiltersUsed: true,
};

const DEFAULT_PDF_OPTIONS: PdfOptions = {
  showHeader: true,
  includeStats: true,
  showFiltersContext: true,
  colorBadges: true,
  compactMode: false,
  showLevelBar: false,
  showVerifierRole: true,
};

function buildDefaultConfig(): ExportConfig {
  const columns: Record<string, boolean> = {};
  ALL_COLUMNS.forEach(c => { columns[c.key] = c.defaultOn; });
  return {
    columns,
    groupByStatus: false,
    groupByForm: false,
    sortBy: '',
    csvOptions: { ...DEFAULT_CSV_OPTIONS },
    pdfOptions: { ...DEFAULT_PDF_OPTIONS },
  };
}

// ─── Status tab config ────────────────────────────────────────────────────────

const STATUS_TABS: { label: string; key: string; color: string }[] = [
  { label: 'All',      key: 'All',      color: '#3B82F6' },
  { label: 'Pending',  key: 'Pending',  color: '#F59E0B' },
  { label: 'Accepted', key: 'Accepted', color: '#22C55E' },
  { label: 'Rejected', key: 'Rejected', color: '#EF4444' },
  { label: 'Expired',  key: 'Expired',  color: '#94A3B8' },
];

// ─── Utility helpers ──────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function wrap(val: string, doWrap: boolean) {
  if (!doWrap) return val;
  return `"${val.replace(/"/g, '""')}"`;
}

function applySort(subs: Submission[], sortBy: SortOption): Submission[] {
  const arr = [...subs];
  switch (sortBy) {
    case 'date_desc': return arr.sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
    case 'date_asc':  return arr.sort((a, b) => new Date(a.submissionDate).getTime() - new Date(b.submissionDate).getTime());
    case 'name_asc':  return arr.sort((a, b) => a.studentName.localeCompare(b.studentName));
    case 'status':    return arr.sort((a, b) => a.status.localeCompare(b.status));
    case 'level':     return arr.sort((a, b) => (b.currentLevel / b.totalLevels) - (a.currentLevel / a.totalLevels));
    default:          return arr;
  }
}

function groupSubmissions(
  subs: Submission[],
  groupByStatus: boolean,
  groupByForm: boolean,
): { groupLabel: string | null; rows: Submission[] }[] {
  if (!groupByStatus && !groupByForm) return [{ groupLabel: null, rows: subs }];

  const map = new Map<string, Submission[]>();
  subs.forEach(s => {
    const key = [
      groupByStatus ? s.status : null,
      groupByForm   ? s.formTitle : null,
    ].filter(Boolean).join(' — ');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  });

  return Array.from(map.entries()).map(([groupLabel, rows]) => ({ groupLabel, rows }));
}

// ─── Export: CSV ──────────────────────────────────────────────────────────────

function exportToCSV(
  submissions: Submission[],
  stats: Stats,
  config: ExportConfig,
  activeFilters: string,
) {
  const { columns, groupByStatus, groupByForm, sortBy, csvOptions: opt } = config;
  const activeCols = ALL_COLUMNS.filter(c => columns[c.key]);
  const w = (v: string) => wrap(v, opt.wrapValues);

  const sorted = applySort(submissions, sortBy);
  const groups = groupSubmissions(sorted, groupByStatus, groupByForm);

  const lines: string[] = [];

  if (opt.includeTimestamp) {
    lines.push(`# Exported on: ${new Date().toLocaleString('en-IN')}`);
  }
  if (opt.includeFiltersUsed && activeFilters) {
    lines.push(`# Filters: ${activeFilters}`);
  }
  if (opt.includeTimestamp || (opt.includeFiltersUsed && activeFilters)) {
    lines.push('');
  }

  if (opt.includeStats) {
    lines.push('## Summary');
    lines.push(`Total,${stats.total}`);
    lines.push(`Pending,${stats.pending}`);
    lines.push(`Accepted,${stats.accepted}`);
    lines.push(`Rejected,${stats.rejected}`);
    lines.push(`Expired,${stats.expired}`);
    lines.push('');
  }

  lines.push('## Submissions');

  groups.forEach(({ groupLabel, rows }) => {
    if (groupLabel) {
      lines.push('');
      lines.push(`### ${groupLabel} (${rows.length})`);
    }

    if (opt.includeHeader) {
      lines.push(activeCols.map(c => w(c.label)).join(','));
    }

    rows.forEach(s => {
      const cells = activeCols.map(c => {
        const key = c.key;
        let val = '';
        if (key === 'submissionDate' || key === 'deadline') {
          val = s[key] ? fmtDate(s[key] as string) : '';
        } else if (key === 'isExpired') {
          val = s.isExpired ? 'Yes' : 'No';
        } else {
          val = String(s[key] ?? '');
        }
        return w(val);
      });
      lines.push(cells.join(','));
    });
  });

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `submissions_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Export: PDF (print-to-PDF via browser) ───────────────────────────────────

function exportToPDF(
  submissions: Submission[],
  stats: Stats,
  config: ExportConfig,
  activeFilters: string,
) {
  const { columns, groupByStatus, groupByForm, sortBy, pdfOptions: opt } = config;
  const activeCols = ALL_COLUMNS.filter(c => columns[c.key]);

  const sorted = applySort(submissions, sortBy);
  const groups = groupSubmissions(sorted, groupByStatus, groupByForm);

  const statusColors: Record<string, { bg: string; color: string }> = {
    Accepted: { bg: '#dcfce7', color: '#16a34a' },
    Pending:  { bg: '#fef9c3', color: '#b45309' },
    Rejected: { bg: '#fee2e2', color: '#dc2626' },
    Expired:  { bg: '#f1f5f9', color: '#64748b' },
  };

  const statsHtml = opt.includeStats ? `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-val">${stats.total}</div><div class="stat-lbl">Total</div></div>
      <div class="stat-card" style="border-left:3px solid #f59e0b"><div class="stat-val">${stats.pending}</div><div class="stat-lbl">Pending</div></div>
      <div class="stat-card" style="border-left:3px solid #22c55e"><div class="stat-val">${stats.accepted}</div><div class="stat-lbl">Accepted</div></div>
      <div class="stat-card" style="border-left:3px solid #ef4444"><div class="stat-val">${stats.rejected}</div><div class="stat-lbl">Rejected</div></div>
      <div class="stat-card" style="border-left:3px solid #94a3b8"><div class="stat-val">${stats.expired}</div><div class="stat-lbl">Expired</div></div>
    </div>` : '';

  const filtersHtml = opt.showFiltersContext && activeFilters
    ? `<p class="filters-line">Applied filters: <em>${activeFilters}</em></p>` : '';

  const renderLevelBar = (level: number, total: number) => {
    const pct = total > 0 ? Math.round((level / total) * 100) : 0;
    return opt.showLevelBar
      ? `<div class="level-wrap">
           <div class="level-bar"><div class="level-fill" style="width:${pct}%"></div></div>
           <span>L${level}/${total}</span>
         </div>`
      : `L${level}/${total}`;
  };

  const groupsHtml = groups.map(({ groupLabel, rows }) => {
    const groupHeader = groupLabel
      ? `<tr class="group-row"><td colspan="${activeCols.length}">${groupLabel} <span class="group-count">${rows.length}</span></td></tr>`
      : '';

    const rowsHtml = rows.map(s => {
      const cells = activeCols.map(c => {
        const key = c.key;
        let cell = '';
        if (key === 'studentName') {
          cell = `<strong>${s.studentName}</strong>${s.email && columns.email ? '' : `<br/><span class="sub">${s.email}</span>`}`;
        } else if (key === 'email') {
          cell = `<span class="sub">${s.email}</span>`;
        } else if (key === 'submissionDate' || key === 'deadline') {
          cell = s[key] ? fmtDate(s[key] as string) : '—';
        } else if (key === 'status') {
          const sc = opt.colorBadges ? statusColors[s.status] : { bg: '#f1f5f9', color: '#1e293b' };
          cell = `<span class="badge" style="background:${sc.bg};color:${sc.color}">${s.status}</span>`;
        } else if (key === 'overallStatus') {
          cell = s.overallStatus;
        } else if (key === 'currentLevel') {
          cell = renderLevelBar(s.currentLevel, s.totalLevels);
        } else if (key === 'totalLevels') {
          cell = String(s.totalLevels);
        } else if (key === 'currentVerifier') {
          cell = opt.showVerifierRole
            ? `${s.currentVerifier}<br/><span class="sub">${s.currentVerifierRole}</span>`
            : s.currentVerifier;
        } else if (key === 'currentVerifierRole') {
          cell = s.currentVerifierRole;
        } else if (key === 'isExpired') {
          cell = s.isExpired ? 'Yes' : 'No';
        } else if (key === 'formTitle') {
          cell = s.formTitle;
        }
        return `<td>${cell}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return groupHeader + rowsHtml;
  }).join('');

  const colWidthHints = activeCols.map(c => {
    const widths: Record<string, string> = {
      studentName: '18%', email: '18%', formTitle: '16%',
      submissionDate: '10%', deadline: '10%', status: '9%',
      currentLevel: '9%', currentVerifier: '14%',
    };
    return `<col style="width:${widths[c.key] ?? 'auto'}"/>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Submissions Export</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:${opt.compactMode ? '11' : '12'}px;color:#1e293b;padding:${opt.compactMode ? '16' : '24'}px}
    h1{font-size:18px;font-weight:700;margin-bottom:3px}
    .meta{color:#64748b;font-size:11px;margin-bottom:${opt.compactMode ? '10' : '18'}px}
    .filters-line{font-size:11px;color:#64748b;margin-bottom:12px}
    .stats-grid{display:flex;gap:10px;margin-bottom:${opt.compactMode ? '12' : '18'}px;flex-wrap:wrap}
    .stat-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 14px;min-width:80px;border-left:3px solid #3b82f6}
    .stat-val{font-size:20px;font-weight:700;color:#1e293b}
    .stat-lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th{background:#f1f5f9;text-align:left;padding:${opt.compactMode ? '5' : '8'}px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:2px solid #e2e8f0}
    td{padding:${opt.compactMode ? '5' : '8'}px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top;word-break:break-word}
    .group-row td{background:#eff6ff;color:#1d4ed8;font-weight:700;font-size:11px;padding:5px 10px;border-bottom:1px solid #bfdbfe}
    .group-count{background:#dbeafe;color:#1d4ed8;border-radius:9px;padding:1px 6px;font-size:10px;margin-left:4px}
    .sub{color:#94a3b8;font-size:10px}
    .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700}
    .level-wrap{display:flex;align-items:center;gap:6px}
    .level-bar{flex:1;height:5px;background:#e2e8f0;border-radius:99px;overflow:hidden}
    .level-fill{height:100%;background:#3b82f6;border-radius:99px}
    @media print{body{padding:0}}
  </style>
</head>
<body>
${opt.showHeader ? `
  <h1>All Submissions</h1>
  <p class="meta">
    Exported on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
    &nbsp;·&nbsp; ${submissions.length} records
    ${sortBy ? ` &nbsp;·&nbsp; Sorted by: ${sortBy.replace('_', ' ')}` : ''}
  </p>` : ''}
${filtersHtml}
${statsHtml}
<table>
  <colgroup>${colWidthHints}</colgroup>
  <thead>
    <tr>${activeCols.map(c => `<th>${c.label}</th>`).join('')}</tr>
  </thead>
  <tbody>${groupsHtml}</tbody>
</table>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

// ─── Export Builder Modal ─────────────────────────────────────────────────────

interface ExportModalProps {
  format: ExportFormat;
  submissions: Submission[];
  stats: Stats;
  activeFilters: string;
  onClose: () => void;
}

function ExportModal({ format, submissions, stats, activeFilters, onClose }: ExportModalProps) {
  const [config, setConfig] = useState<ExportConfig>(buildDefaultConfig);

  const activeCols = ALL_COLUMNS.filter(c => config.columns[c.key]);
  const allOn = ALL_COLUMNS.every(c => config.columns[c.key]);
  const noneOn = ALL_COLUMNS.every(c => !config.columns[c.key]);

  const toggleCol = (key: string) =>
    setConfig(prev => ({ ...prev, columns: { ...prev.columns, [key]: !prev.columns[key] } }));

  const toggleAll = () => {
    const newVal = !allOn;
    const cols: Record<string, boolean> = {};
    ALL_COLUMNS.forEach(c => { cols[c.key] = newVal; });
    setConfig(prev => ({ ...prev, columns: cols }));
  };

  const setCsvOpt = (k: keyof CsvOptions, v: boolean) =>
    setConfig(prev => ({ ...prev, csvOptions: { ...prev.csvOptions, [k]: v } }));

  const setPdfOpt = (k: keyof PdfOptions, v: boolean) =>
    setConfig(prev => ({ ...prev, pdfOptions: { ...prev.pdfOptions, [k]: v } }));

  const handleExport = () => {
    if (format === 'CSV') exportToCSV(submissions, stats, config, activeFilters);
    else exportToPDF(submissions, stats, config, activeFilters);
    onClose();
  };

  const CSV_OPTION_LABELS: { key: keyof CsvOptions; label: string }[] = [
    { key: 'includeHeader',     label: 'Include header row' },
    { key: 'includeStats',      label: 'Append summary stats block' },
    { key: 'includeTimestamp',  label: 'Include export timestamp' },
    { key: 'wrapValues',        label: 'Wrap values in quotes' },
    { key: 'includeFiltersUsed', label: 'Include applied filters' },
  ];

  const PDF_OPTION_LABELS: { key: keyof PdfOptions; label: string }[] = [
    { key: 'showHeader',          label: 'Show header with export date' },
    { key: 'includeStats',        label: 'Include stats summary table' },
    { key: 'showFiltersContext',   label: 'Show applied filter context' },
    { key: 'colorBadges',         label: 'Colour-coded status badges' },
    { key: 'compactMode',         label: 'Compact row spacing' },
    { key: 'showLevelBar',        label: 'Show level progress bar' },
    { key: 'showVerifierRole',    label: 'Show verifier role subtitle' },
  ];

  const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: '',          label: 'Default order' },
    { value: 'date_desc', label: 'Date (newest first)' },
    { value: 'date_asc',  label: 'Date (oldest first)' },
    { value: 'name_asc',  label: 'Student name A–Z' },
    { value: 'status',    label: 'Status' },
    { value: 'level',     label: 'Level progress' },
  ];

  const isCsv = format === 'CSV';
  const accentColor = isCsv ? '#16a34a' : '#dc2626';
  const accentBg = isCsv ? '#dcfce7' : '#fee2e2';

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full flex flex-col"
        style={{
          maxWidth: 780,
          maxHeight: '90vh',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            {isCsv
              ? <Table2 className="w-5 h-5" style={{ color: accentColor }} />
              : <FileText className="w-5 h-5" style={{ color: accentColor }} />
            }
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>
                Export Builder
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Configure exactly what gets exported
              </p>
            </div>
            <span
              className="ml-2 text-xs font-bold px-2 py-1 rounded-md"
              style={{ background: accentBg, color: accentColor }}
            >
              {format}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex overflow-hidden flex-1 min-h-0">

          {/* Left: column picker */}
          <div
            className="flex flex-col flex-shrink-0 overflow-y-auto"
            style={{
              width: 280,
              borderRight: '1px solid var(--border)',
              padding: '16px 20px',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Columns
              </p>
              <button
                onClick={toggleAll}
                className="text-xs font-semibold"
                style={{ color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {allOn ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {ALL_COLUMNS.map(col => {
                const on = config.columns[col.key];
                return (
                  <button
                    key={col.key}
                    onClick={() => toggleCol(col.key)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all"
                    style={{
                      background: on ? '#EFF6FF' : 'var(--bg)',
                      border: `1px solid ${on ? '#BFDBFE' : 'var(--border)'}`,
                      color: on ? '#1D4ED8' : 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={{
                        background: on ? '#3B82F6' : 'transparent',
                        border: `1.5px solid ${on ? '#3B82F6' : 'var(--border)'}`,
                      }}
                    >
                      {on && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className="text-sm">{col.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

            {/* Sort */}
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Sort rows by
            </p>
            <div className="relative">
              <select
                value={config.sortBy}
                onChange={e => setConfig(prev => ({ ...prev, sortBy: e.target.value as SortOption }))}
                className="form-input appearance-none pr-8 cursor-pointer w-full text-sm"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--text-muted)' }} />
            </div>

            {/* Grouping */}
            <p className="text-xs font-semibold uppercase tracking-wider mt-4 mb-2" style={{ color: 'var(--text-muted)' }}>
              Group rows by
            </p>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={config.groupByStatus}
                onChange={e => setConfig(prev => ({ ...prev, groupByStatus: e.target.checked }))}
                className="w-4 h-4 accent-blue-500 cursor-pointer"
              />
              <span className="text-sm" style={{ color: 'var(--text)' }}>Group by status</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.groupByForm}
                onChange={e => setConfig(prev => ({ ...prev, groupByForm: e.target.checked }))}
                className="w-4 h-4 accent-blue-500 cursor-pointer"
              />
              <span className="text-sm" style={{ color: 'var(--text)' }}>Group by form</span>
            </label>
          </div>

          {/* Right: options + preview */}
          <div className="flex flex-col flex-1 overflow-y-auto" style={{ padding: '16px 20px' }}>

            {/* Format-specific options */}
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              {format} options
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-5">
              {(isCsv ? CSV_OPTION_LABELS : PDF_OPTION_LABELS).map(opt => (
                <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCsv ? config.csvOptions[opt.key as keyof CsvOptions] : config.pdfOptions[opt.key as keyof PdfOptions]}
                    onChange={e => isCsv
                      ? setCsvOpt(opt.key as keyof CsvOptions, e.target.checked)
                      : setPdfOpt(opt.key as keyof PdfOptions, e.target.checked)
                    }
                    className="w-4 h-4 accent-blue-500 cursor-pointer flex-shrink-0"
                  />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{opt.label}</span>
                </label>
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)', marginBottom: 16 }} />

            {/* Preview */}
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Export preview
            </p>

            {/* Column preview tags */}
            <div className="mb-4">
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                {activeCols.length} column{activeCols.length !== 1 ? 's' : ''} selected
                {noneOn && <span className="ml-2 font-semibold" style={{ color: '#EF4444' }}>— select at least one column</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activeCols.map(c => (
                  <span
                    key={c.key}
                    className="text-xs px-2 py-1 rounded-md"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Config summary */}
            <div
              className="rounded-xl p-4 text-sm flex flex-col gap-2"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Records</span>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{submissions.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Columns</span>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{activeCols.length} / {ALL_COLUMNS.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Sorting</span>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>
                  {SORT_OPTIONS.find(o => o.value === config.sortBy)?.label ?? 'Default'}
                </span>
              </div>
              {(config.groupByStatus || config.groupByForm) && (
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Grouped by</span>
                  <span className="font-semibold" style={{ color: 'var(--text)' }}>
                    {[config.groupByStatus && 'Status', config.groupByForm && 'Form'].filter(Boolean).join(' + ')}
                  </span>
                </div>
              )}
              {isCsv && config.csvOptions.includeStats && (
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Stats block</span>
                  <span className="font-semibold" style={{ color: '#22C55E' }}>Included</span>
                </div>
              )}
              {activeFilters && (
                <div className="flex items-start justify-between gap-4">
                  <span style={{ color: 'var(--text-muted)' }}>Active filters</span>
                  <span className="font-semibold text-right" style={{ color: 'var(--text)', maxWidth: 220 }}>
                    {activeFilters}
                  </span>
                </div>
              )}
            </div>

            {/* CSV structure preview */}
            {isCsv && activeCols.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider mt-4 mb-2" style={{ color: 'var(--text-muted)' }}>
                  CSV structure preview
                </p>
                <div
                  className="rounded-lg p-3 overflow-x-auto"
                  style={{ background: '#0F172A', fontFamily: 'monospace', fontSize: 11 }}
                >
                  {config.csvOptions.includeTimestamp && (
                    <div style={{ color: '#64748B' }}>{`# Exported on: ${new Date().toLocaleString('en-IN')}`}</div>
                  )}
                  {config.csvOptions.includeFiltersUsed && activeFilters && (
                    <div style={{ color: '#64748B' }}>{`# Filters: ${activeFilters}`}</div>
                  )}
                  {config.csvOptions.includeStats && (
                    <>
                      <div style={{ color: '#64748B' }}>&nbsp;</div>
                      <div style={{ color: '#94A3B8' }}>## Summary</div>
                      <div style={{ color: '#94A3B8' }}>Total,{submissions.length}</div>
                    </>
                  )}
                  <div style={{ color: '#64748B' }}>&nbsp;</div>
                  <div style={{ color: '#94A3B8' }}>## Submissions</div>
                  {config.csvOptions.includeHeader && (
                    <div style={{ color: '#38BDF8' }}>
                      {activeCols.map(c => config.csvOptions.wrapValues ? `"${c.label}"` : c.label).join(',')}
                    </div>
                  )}
                  <div style={{ color: '#E2E8F0' }}>
                    {activeCols.map(c => {
                      const samples: Record<string, string> = {
                        studentName: 'Rahul Sharma', email: 'rahul@example.com',
                        formTitle: 'NOC Application', submissionDate: '12 Apr 2025',
                        deadline: '30 Apr 2025', status: 'Pending',
                        overallStatus: 'In Progress', currentLevel: '2',
                        totalLevels: '3', currentVerifier: 'Dr. Mehta',
                        currentVerifierRole: 'HOD', isExpired: 'No',
                      };
                      const v = samples[c.key] ?? '';
                      return config.csvOptions.wrapValues ? `"${v}"` : v;
                    }).join(',')}
                  </div>
                  <div style={{ color: '#475569' }}>...</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0 gap-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {submissions.length} record{submissions.length !== 1 ? 's' : ''} will be exported
            {' '}with {activeCols.length} column{activeCols.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="btn-outline text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={noneOn}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: noneOn ? '#94A3B8' : accentColor }}
            >
              <Download className="w-4 h-4" />
              Export {format}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inner component ──────────────────────────────────────────────────────────

function SubmissionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filters (instant)
  const [status, setStatus] = useState(searchParams.get('status') ?? 'All');
  const [formId, setFormId] = useState(searchParams.get('formId') ?? '');

  // Committed filter values (used in API call)
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Draft values (typed but not yet committed)
  const [searchDraft, setSearchDraft] = useState(searchParams.get('search') ?? '');
  const [startDraft, setStartDraft] = useState('');
  const [endDraft, setEndDraft] = useState('');

  // Pagination (client-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Export modal
  const [exportModal, setExportModal] = useState<ExportFormat | null>(null);

  // ── Fetch all matching submissions ────────────────────────────────────────
  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (status && status !== 'All') params.set('status', status);
      if (formId) params.set('formId', formId);
      if (search) params.set('search', search);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/verifier/all-submissions?${params.toString()}`);
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to load submissions');
      }

      setData(await res.json());
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [status, formId, search, startDate, endDate, router]);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  // ── Commit helpers ────────────────────────────────────────────────────────
  const commitSearch = () => setSearch(searchDraft);
  const commitDates  = () => { setStartDate(startDraft); setEndDate(endDraft); };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitSearch();
  };
  const handleDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitDates();
  };

  // ── Clear ─────────────────────────────────────────────────────────────────
  const clearFilters = () => {
    setSearchDraft(''); setSearch('');
    setStartDraft(''); setStartDate('');
    setEndDraft(''); setEndDate('');
    setStatus('All'); setFormId('');
    setPage(1);
  };

  // ── Active filters label for export ──────────────────────────────────────
  const activeFiltersLabel = useMemo(() => {
    const parts: string[] = [];
    if (status !== 'All') parts.push(`Status: ${status}`);
    if (formId && data) {
      const f = data.formOptions.find(o => String(o.id) === formId);
      if (f) parts.push(`Form: ${f.title}`);
    }
    if (search) parts.push(`Search: "${search}"`);
    if (startDate) parts.push(`From: ${startDate}`);
    if (endDate) parts.push(`To: ${endDate}`);
    return parts.join(' | ');
  }, [status, formId, search, startDate, endDate, data]);

  // ── Client-side pagination slice ──────────────────────────────────────────
  const allSubmissions = data?.submissions ?? [];
  const total = allSubmissions.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedSubmissions = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return allSubmissions.slice(start, start + pageSize);
  }, [allSubmissions, safePage, pageSize]);

  // ── Page number window ────────────────────────────────────────────────────
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const delta = 2;
    const left = Math.max(2, safePage - delta);
    const right = Math.min(totalPages - 1, safePage + delta);
    const nums: (number | '...')[] = [1];
    if (left > 2) nums.push('...');
    for (let i = left; i <= right; i++) nums.push(i);
    if (right < totalPages - 1) nums.push('...');
    nums.push(totalPages);
    return nums;
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
        <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>Loading submissions...</span>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{error ?? 'No data found'}</p>
        <button onClick={fetchSubmissions} className="btn-outline text-sm">Retry</button>
      </div>
    );
  }

  const { stats, formOptions } = data;
  const hasFilters = searchDraft || search || status !== 'All' || formId || startDraft || startDate || endDraft || endDate;

  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, total);

  const statCards = [
    { key: 'total',    label: 'Total',    value: stats.total,    icon: FileStack,    color: '#3B82F6', bg: '#EFF6FF' },
    { key: 'pending',  label: 'Pending',  value: stats.pending,  icon: Clock,        color: '#F59E0B', bg: '#FFFBEB' },
    { key: 'accepted', label: 'Accepted', value: stats.accepted, icon: CheckCircle,  color: '#22C55E', bg: '#F0FDF4' },
    { key: 'rejected', label: 'Rejected', value: stats.rejected, icon: XCircle,      color: '#EF4444', bg: '#FFF5F5' },
    { key: 'expired',  label: 'Expired',  value: stats.expired,  icon: AlertTriangle,color: '#94A3B8', bg: '#F8FAFC' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Export modal */}
      {exportModal && (
        <ExportModal
          format={exportModal}
          submissions={allSubmissions}
          stats={stats}
          activeFilters={activeFiltersLabel}
          onClose={() => setExportModal(null)}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>All Submissions</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {total === 0
              ? 'No submissions found'
              : <>Showing <strong style={{ color: 'var(--text)' }}>{rangeStart}–{rangeEnd}</strong> of <strong style={{ color: 'var(--text)' }}>{total}</strong> submissions</>
            }
          </p>
        </div>
        <div className="export-group flex items-center gap-2">
          <button
            onClick={() => setExportModal('CSV')}
            className="btn-outline flex items-center gap-2"
          >
            <Table2 className="w-4 h-4 text-green-500" />
            Export CSV
            <Settings2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={() => setExportModal('PDF')}
            className="btn-outline flex items-center gap-2"
          >
            <FileText className="w-4 h-4 text-red-400" />
            Export PDF
            <Settings2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {statCards.map(({ key, label, value, icon: Icon, color, bg }) => (
          <div
            key={key}
            className="content-card p-4 cursor-pointer transition-all hover:shadow-md"
            onClick={() => setStatus(key === 'total' ? 'All' : label)}
            style={{ outline: status === (key === 'total' ? 'All' : label) ? `2px solid ${color}` : 'none' }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: bg }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Status tabs + form dropdown */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 items-center">
        {STATUS_TABS.map(({ label, key, color }) => {
          const count = key === 'All'      ? stats.total
            : key === 'Pending'   ? stats.pending
            : key === 'Accepted'  ? stats.accepted
            : key === 'Rejected'  ? stats.rejected
            : stats.expired;
          const active = status === key;
          return (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap"
              style={{
                background: active ? `${color}18` : 'var(--card)',
                color: active ? color : 'var(--text-muted)',
                border: `1px solid ${active ? color + '40' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {label}
              <span
                className="px-1.5 py-0.5 rounded-md text-xs"
                style={{
                  background: active ? color + '25' : 'var(--bg)',
                  color: active ? color : 'var(--text-muted)',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}

        {formOptions.length > 1 && (
          <div className="relative min-w-48 ml-auto">
            <select
              value={formId}
              onChange={e => setFormId(e.target.value)}
              className="form-input appearance-none pr-8 cursor-pointer"
            >
              <option value="">All Forms</option>
              {formOptions.map(f => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>

      {/* Search + date filters */}
      <div className="content-card mb-5">
        <div className="p-4 flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              value={searchDraft}
              onChange={e => setSearchDraft(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onBlur={commitSearch}
              placeholder="Search by student name or email… (press Enter)"
              className="form-input pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDraft}
              onChange={e => setStartDraft(e.target.value)}
              onKeyDown={handleDateKeyDown}
              onBlur={commitDates}
              className="form-input"
              title="From date (press Enter to apply)"
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>to</span>
            <input
              type="date"
              value={endDraft}
              onChange={e => setEndDraft(e.target.value)}
              onKeyDown={handleDateKeyDown}
              onBlur={commitDates}
              className="form-input"
              title="To date (press Enter to apply)"
            />
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="btn-outline flex items-center gap-1.5">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="content-card">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Form</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Current Verifier</th>
                <th>Level</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Filter className="w-10 h-10" style={{ color: 'var(--text-muted)' }} />
                      <p className="font-semibold" style={{ color: 'var(--text)' }}>No submissions match your filters</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedSubmissions.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: `hsl(${s.studentName.charCodeAt(0) * 7},60%,50%)` }}
                        >
                          {s.studentName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{s.studentName}</p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.email}</p>
                        </div>
                      </div>
                    </td>

                    <td>
                      <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{s.formTitle}</p>
                    </td>

                    <td className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {fmtDate(s.submissionDate)}
                    </td>

                    <td>
                      <span className={`badge badge-${s.status.toLowerCase()}`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                        {s.status}
                      </span>
                    </td>

                    <td>
                      <p className="text-sm" style={{ color: 'var(--text)' }}>{s.currentVerifier}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.currentVerifierRole}</p>
                    </td>

                    <td>
                      <div className="flex items-center gap-1 text-sm">
                        <span className="font-bold" style={{ color: '#3B82F6' }}>L{s.currentLevel}</span>
                        <span style={{ color: 'var(--text-muted)' }}>/{s.totalLevels}</span>
                      </div>
                    </td>

                    <td>
                      <Link
                        href={`/form-details/${s.id}`}
                        className="flex items-center gap-1.5 text-sm font-semibold"
                        style={{ color: '#3B82F6', textDecoration: 'none' }}
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination footer ── */}
        {total > 0 && (
          <div
            className="px-6 py-3 border-t flex flex-wrap items-center justify-between gap-3 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <div className="flex items-center gap-3">
              <span>
                Showing{' '}
                <strong style={{ color: 'var(--text)' }}>{rangeStart}–{rangeEnd}</strong>
                {' '}of{' '}
                <strong style={{ color: 'var(--text)' }}>{total}</strong>
              </span>

              <div className="relative">
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="form-input appearance-none pr-6 py-1 text-xs cursor-pointer"
                >
                  {[10, 20, 50, 100].map(n => (
                    <option key={n} value={n}>{n} / page</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={safePage === 1}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  title="First page"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {getPageNumbers().map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-1" style={{ color: 'var(--text-muted)' }}>…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className="min-w-[2rem] h-8 px-2 rounded-lg text-xs font-semibold transition-colors"
                      style={{
                        background: safePage === p ? '#3B82F6' : 'var(--bg)',
                        color: safePage === p ? '#fff' : 'var(--text)',
                        border: `1px solid ${safePage === p ? '#3B82F6' : 'var(--border)'}`,
                      }}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  title="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setPage(totalPages)}
                  disabled={safePage === totalPages}
                  className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  title="Last page"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function AllSubmissionsPage() {
  return (
    <DashboardLayout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
            <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>Loading submissions...</span>
          </div>
        }
      >
        <SubmissionsContent />
      </Suspense>
    </DashboardLayout>
  );
}