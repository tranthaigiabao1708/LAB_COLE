const TEXT_EXT = new Set(['py', 'md', 'txt', 'csv', 'tsv', 'json', 'jsonl', 'ndjson', 'sql', 'yaml', 'yml', 'toml', 'ipynb', 'html', 'xml', 'svg', 'log', 'ini', 'cfg', 'sh', 'env', 'gitignore']);

export const extOf = (p: string) => {
  const name = p.split('/').pop() ?? p;
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
};
export const isTextExt = (ext: string) => TEXT_EXT.has(ext) || ext === '';
export const basename = (p: string) => p.split('/').pop() ?? p;
export const dirname = (p: string) => p.split('/').slice(0, -1).join('/');

export function fmtBytes(n?: number | null) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtDuration(ms?: number) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function fmtTime(t?: number) {
  if (!t) return '—';
  return new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDateTime(t?: number) {
  if (!t) return '—';
  return new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function relTime(t?: number) {
  if (!t) return '—';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'vừa xong';
  if (s < 60) return `${s}s trước`;
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

export function fmtNum(v: unknown, digits = 3) {
  if (typeof v !== 'number' || !isFinite(v)) return String(v ?? '—');
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return v.toFixed(digits);
}

/** Lightweight CSV preview parser (browser-side, first N rows only). */
export function parseCsvPreview(text: string, maxRows = 200): { header: string[]; rows: string[][]; totalLinesApprox: number } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  let i = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
      if (rows.length > maxRows) break;
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  let lines = 0;
  for (let j = 0; j < text.length; j++) if (text.charCodeAt(j) === 10) lines++;
  return { header, rows: rows.slice(0, maxRows), totalLinesApprox: Math.max(0, lines - 1) };
}

export function downloadContent(name: string, content: string, encoding: 'utf8' | 'base64') {
  let blob: Blob;
  if (encoding === 'base64') {
    const bin = atob(content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([bytes]);
  } else blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const cellText = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));
