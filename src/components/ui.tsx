import { useMemo, useState, type ReactNode } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  Copy, Check, FileCode2, FileJson, FileSpreadsheet, FileText, FileBox, NotebookPen, Database,
  Image as ImageIcon, BrainCircuit, FileCog, File as FileIcon2, Inbox,
} from 'lucide-react';
import type { ArtifactType, RuntimeStatus } from '../lib/types';
import { cellText, copyText, extOf } from '../lib/format';

export function DemoBadge({ label = 'Demo data' }: { label?: string }) {
  return <span className="badge demo" title="Dữ liệu minh hoạ: chưa kết nối backend thật">{label}</span>;
}

export const RUNTIME_LABEL: Record<RuntimeStatus, string> = {
  stopped: 'Stopped', starting: 'Starting', running: 'Running', busy: 'Executing', error: 'Error', 'restart-required': 'Restart required',
};
const RUNTIME_TONE: Record<RuntimeStatus, string> = {
  stopped: '', starting: 'amber pulse', running: 'green', busy: 'amber pulse', error: 'red', 'restart-required': 'violet',
};
export function RuntimeDot({ status }: { status: RuntimeStatus }) {
  return <span className={`dot ${RUNTIME_TONE[status]}`} />;
}

export function PathChip({ path, title }: { path: string; title?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <span className="path-chip" title={title ?? path}>
      <span>{path}</span>
      <button
        className="icon-btn sm"
        aria-label="Copy path"
        onClick={async (e) => { e.stopPropagation(); if (await copyText(path)) { setOk(true); setTimeout(() => setOk(false), 1200); } }}
      >
        {ok ? <Check size={12} className="t-green" /> : <Copy size={12} />}
      </button>
    </span>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={26} />}
      <h4>{title}</h4>
      {children && <div>{children}</div>}
    </div>
  );
}

export function FileIcon({ path, size = 14 }: { path: string; size?: number }) {
  const ext = extOf(path);
  const p = { size, className: 'fi' };
  if (ext === 'ipynb') return <NotebookPen {...p} color="hsl(30 90% 62%)" />;
  if (ext === 'py') return <FileCode2 {...p} color="hsl(213 92% 66%)" />;
  if (ext === 'sql') return <Database {...p} color="hsl(266 88% 74%)" />;
  if (['csv', 'tsv', 'parquet', 'jsonl'].includes(ext)) return <FileSpreadsheet {...p} color="hsl(146 62% 50%)" />;
  if (ext === 'json') return <FileJson {...p} color="hsl(48 90% 60%)" />;
  if (ext === 'md') return <FileText {...p} color="hsl(200 20% 70%)" />;
  if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext)) return <ImageIcon {...p} color="hsl(340 82% 68%)" />;
  if (['pkl', 'joblib', 'pt', 'pth', 'onnx', 'h5'].includes(ext)) return <BrainCircuit {...p} color="hsl(188 86% 53%)" />;
  if (['yaml', 'yml', 'toml', 'ini', 'cfg'].includes(ext)) return <FileCog {...p} color="hsl(210 15% 65%)" />;
  return <FileIcon2 {...p} color="hsl(210 15% 55%)" />;
}

export const ARTIFACT_TONE: Record<ArtifactType, string> = {
  dataset: 'green', model: 'accent', metrics: 'amber', chart: 'violet', notebook: 'blue', report: 'teal', config: '', code: 'blue', index: 'violet', other: '',
};
export function ArtifactTypeBadge({ type }: { type: ArtifactType }) {
  return <span className={`badge ${ARTIFACT_TONE[type]}`}>{type}</span>;
}
export function ArtifactIcon({ type, size = 14 }: { type: ArtifactType; size?: number }) {
  if (type === 'dataset') return <FileSpreadsheet size={size} color="hsl(146 62% 50%)" />;
  if (type === 'model') return <BrainCircuit size={size} color="hsl(188 86% 53%)" />;
  if (type === 'chart') return <ImageIcon size={size} color="hsl(266 88% 74%)" />;
  if (type === 'metrics') return <FileJson size={size} color="hsl(38 94% 60%)" />;
  return <FileBox size={size} color="hsl(210 15% 60%)" />;
}

export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(source, { async: false }) as string), [source]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

const isNumericDtype = (d: string) => /int|float|uint|decimal|number/i.test(d);

export function DataTable({ columns, rows, index, startIndex = 0 }: {
  columns: { name: string; dtype?: string }[]; rows: unknown[][]; index?: string[]; startIndex?: number;
}) {
  return (
    <table className="dtable">
      <thead>
        <tr>
          <th className="idx">#</th>
          {columns.map((c, i) => (
            <th key={i} title={c.dtype}>{c.name}{c.dtype && <span className="dtype">{c.dtype}</span>}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="idx">{index?.[i] ?? startIndex + i}</td>
            {r.map((v, j) => {
              const t = cellText(v);
              const num = isNumericDtype(columns[j]?.dtype ?? '');
              return t === null
                ? <td key={j} className="null">null</td>
                : <td key={j} className={num ? 'numc' : ''} title={t.length > 40 ? t : undefined}>{t}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MiniHist({ counts, width = 220, height = 38 }: { counts: number[]; width?: number; height?: number }) {
  const max = Math.max(1, ...counts);
  const w = width / counts.length;
  return (
    <svg width={width} height={height} className="spark" role="img" aria-label="Histogram">
      {counts.map((c, i) => {
        const h = Math.max(1, (c / max) * (height - 2));
        return <rect key={i} x={i * w + 1} y={height - h} width={Math.max(1, w - 2)} height={h} rx={1.5} fill="url(#hgrad)" />;
      })}
      <defs>
        <linearGradient id="hgrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="hsl(188 86% 58%)" />
          <stop offset="1" stopColor="hsl(200 90% 40%)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LineChart({ series, width = 420, height = 160 }: { series: { name: string; values: number[]; color: string }[]; width?: number; height?: number }) {
  const all = series.flatMap((s) => s.values);
  if (!all.length) return null;
  const min = Math.min(...all), max = Math.max(...all);
  const n = Math.max(...series.map((s) => s.values.length));
  const pad = 28;
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (width - pad - 8);
  const y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (height - 30);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Training history">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad} x2={width - 8} y1={8 + t * (height - 30)} y2={8 + t * (height - 30)} stroke="var(--line)" />
          <text x={2} y={12 + t * (height - 30)} fontSize="9" fill="var(--fg-3)" fontFamily="var(--font-mono)">{(max - t * (max - min)).toFixed(3)}</text>
        </g>
      ))}
      {series.map((s) => (
        <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={1.8} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      ))}
      <text x={pad} y={height - 4} fontSize="9" fill="var(--fg-3)">iteration 1</text>
      <text x={width - 8} y={height - 4} fontSize="9" fill="var(--fg-3)" textAnchor="end">{n}</text>
    </svg>
  );
}

export function ConfusionMatrix({ matrix, labels }: { matrix: number[][]; labels?: string[] | null }) {
  const max = Math.max(1, ...matrix.flat());
  const n = matrix.length;
  return (
    <div>
      <div className="cm-grid" style={{ gridTemplateColumns: `70px repeat(${n}, minmax(56px, 1fr))` }}>
        <div className="xs dim center">true ↓ / pred →</div>
        {matrix[0].map((_, j) => <div key={j} className="xs muted center">{labels?.[j] ?? j}</div>)}
        {matrix.map((row, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <div className="xs muted center">{labels?.[i] ?? i}</div>
            {row.map((v, j) => (
              <div key={j} className="cm-cell" style={{ background: `hsl(${i === j ? 188 : 357} 80% 55% / ${0.08 + (v / max) * 0.6})` }}>{v}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
