import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Database, Filter, GitCompare, Loader2, Play, RefreshCw, Rows3, Save, Table2, BarChart3, AlertTriangle, HardDrive, Info,
} from 'lucide-react';
import { useWs, getRuntimeClient, type GroupId } from '../../state/workspace';
import type { DataTarget, ProfileResult } from '../../lib/types';
import { DataTable, Empty, MiniHist, PathChip } from '../../components/ui';
import { promptDialog, toast } from '../../components/dialogs';
import { basename, fmtBytes, fmtDateTime, fmtNum, parseCsvPreview } from '../../lib/format';

const PAGE = 100;
type Mode = 'table' | 'profile' | 'compare';
const targetKey = (t: DataTarget) => (t.kind === 'file' ? `file:${t.path}` : `var:${t.expr}`);

function useAlive() {
  const status = useWs((s) => s.runtime.status);
  return status === 'running' || status === 'busy' || status === 'restart-required';
}

/** Version token: changes when the underlying data may have changed. */
function useDataToken(t: DataTarget) {
  const fileTs = useWs((s) => (t.kind === 'file' ? s.files[t.path]?.updatedAt ?? 0 : 0));
  const runCount = useWs((s) => (t.kind === 'var' ? s.runs.length : 0));
  const session = useWs((s) => s.runtime.info.sessionId);
  return `${fileTs}:${runCount}:${session}`;
}

export default function DataViewer({ target }: { target: DataTarget; group: GroupId }) {
  const alive = useAlive();
  const token = useDataToken(target);
  const runtime = useWs((s) => s.runtime);
  const artifact = useWs((s) => (target.kind === 'file' ? s.artifacts.find((a) => a.path === target.path) : undefined));
  const fileMeta = useWs((s) => (target.kind === 'file' ? s.files[target.path] : undefined));
  const [mode, setMode] = useState<Mode>('table');
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [data, setData] = useState<ProfileResult | null>(null);
  const [profile, setProfile] = useState<ProfileResult['profile'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ header: string[]; rows: string[][]; totalLinesApprox: number } | null>(null);

  // Runtime-backed paging/profiling (data never fully loaded into the UI thread).
  useEffect(() => {
    if (!alive) { setData(null); return; }
    const c = getRuntimeClient();
    if (!c) return;
    let cancelled = false;
    setLoading(true); setError(null);
    c.profile({ ...target, page, pageSize: PAGE, profile: page === 0 || !profile, query: applied || undefined })
      .then((r) => { if (cancelled) return; setData(r); if (r.profile) setProfile(r.profile); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alive, targetKey(target), page, applied, token, nonce]);

  // Browser-side preview when runtime is stopped (files only, first rows only).
  useEffect(() => {
    if (alive || target.kind !== 'file') { setPreview(null); return; }
    if (!/\.(csv|tsv)$/i.test(target.path)) { setPreview(null); return; }
    void useWs.getState().readFile(target.path).then((txt) => setPreview(txt ? parseCsvPreview(txt, 200) : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alive, targetKey(target), token]);

  const saveVar = async () => {
    if (target.kind !== 'var') return;
    const def = `artifacts/${target.expr.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'frame'}.csv`;
    const p = await promptDialog({ title: `Lưu ${target.expr} thành artifact`, label: 'Đường dẫn (CSV)', defaultValue: def, validate: (v) => (/^[\w\-./]+\.csv$/.test(v) && !v.includes('..') ? null : 'Cần đường dẫn tương đối .csv') });
    if (!p) return;
    const code = `import os as _os\n_os.makedirs(_os.path.dirname(${JSON.stringify(p)}) or ".", exist_ok=True)\n${target.expr}.to_csv(${JSON.stringify(p)}, index=False)`;
    const { run } = await useWs.getState().execute({ code, source: 'Save DataFrame as artifact', kind: 'action' });
    toast(run.status === 'ok' ? `Đã lưu ${p}` : `Lỗi: ${run.error?.evalue}`, run.status === 'ok' ? 'success' : 'error');
    if (run.status === 'ok') useWs.getState().openFile(p);
  };

  const pages = data ? Math.max(1, Math.ceil(data.shape[0] / PAGE)) : 1;

  return (
    <div className="dv">
      <div className="dv-head">
        {target.kind === 'file' ? <PathChip path={target.path} /> : <span className="path-chip"><span>{target.expr}</span></span>}
        {target.kind === 'file' ? (
          artifact
            ? <span className="badge accent" title={artifact.storage.uri}><HardDrive size={10} />artifact v{artifact.version} · persisted</span>
            : fileMeta ? <span className="badge teal" title="Persisted in workspace storage"><HardDrive size={10} />persisted · {fileMeta.origin}</span> : <span className="badge red">file missing</span>
        ) : (
          <span className="badge violet" title="Đối tượng trong RAM của runtime, chưa lưu ra storage">◆ in memory · {runtime.info.sessionId || 'no session'} · not persisted</span>
        )}
        <div className="seg">
          <button className={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')}><Table2 size={12} />Table</button>
          <button className={mode === 'profile' ? 'on' : ''} onClick={() => setMode('profile')}><BarChart3 size={12} />Schema &amp; profile</button>
          <button className={mode === 'compare' ? 'on' : ''} onClick={() => setMode('compare')}><GitCompare size={12} />Compare</button>
        </div>
        <div className="grow" />
        {target.kind === 'var' && alive && <button className="btn sm" onClick={() => void saveVar()}><Save size={12} />Save as artifact</button>}
        {alive && <button className="icon-btn" title="Reload" onClick={() => setNonce((n) => n + 1)}><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>}
      </div>

      {alive && data && (
        <div className="dv-head" style={{ paddingTop: 6, paddingBottom: 6 }}>
          <div className="dv-stats">
            <div className="stat"><span className="v">{data.shape[0].toLocaleString()}</span><span className="k">rows{applied ? ' (filtered)' : ''}</span></div>
            <div className="stat"><span className="v">{data.shape[1]}</span><span className="k">columns</span></div>
            {profile && <div className="stat"><span className={`v ${profile.missingTotal ? 't-red' : ''}`}>{profile.missingTotal.toLocaleString()}</span><span className="k">missing cells</span></div>}
            {profile && <div className="stat"><span className={`v ${profile.duplicates ? 't-amber' : ''}`}>{profile.duplicates ?? '—'}</span><span className="k">duplicate rows</span></div>}
            {profile && <div className="stat"><span className="v">{fmtBytes(profile.memoryBytes)}</span><span className="k">memory (pandas)</span></div>}
            {artifact && <div className="stat"><span className="v" style={{ fontSize: 'var(--fs-sm)' }}>{fmtDateTime(artifact.updatedAt)}</span><span className="k">artifact updated</span></div>}
          </div>
          <div className="grow" />
          <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(query.trim()); }}>
            <Filter size={13} className="dim" />
            <input className="input mono" style={{ width: 260 }} placeholder='pandas query, vd. total_amount > 500000' value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter rows with pandas query" />
            <button className="btn sm" type="submit">Apply</button>
            {applied && <button className="btn sm ghost" type="button" onClick={() => { setQuery(''); setApplied(''); setPage(0); }}>Clear</button>}
          </form>
        </div>
      )}

      <div className="dv-body">
        {!alive && <StoppedState target={target} preview={preview} mode={mode} />}
        {alive && error && <div className="p-16"><div className="callout red"><AlertTriangle size={14} /><div><b>Không đọc được dữ liệu</b><div className="mono xs">{error}</div></div></div></div>}
        {alive && !error && !data && <div className="center p-16 muted"><Loader2 className="spin" size={16} /> Đang profile trong runtime…</div>}
        {alive && data && !error && mode === 'table' && <DataTable columns={data.columns} rows={data.rows} index={data.index} />}
        {alive && data && !error && mode === 'profile' && profile && <ProfileGrid profile={profile} rows={data.shape[0]} />}
        {alive && data && !error && mode === 'compare' && <Compare target={target} current={data} currentProfile={profile} />}
      </div>

      {alive && data && mode === 'table' && (
        <div className="pager">
          <Rows3 size={12} />
          <span className="num">{(page * PAGE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE, data.shape[0]).toLocaleString()} / {data.shape[0].toLocaleString()}</span>
          <span className="dim">· trang được lấy theo yêu cầu từ runtime ({PAGE} dòng/lần)</span>
          <div className="grow" />
          <button className="icon-btn sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></button>
          <span className="num">{page + 1} / {pages}</span>
          <button className="icon-btn sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

function StoppedState({ target, preview, mode }: { target: DataTarget; preview: { header: string[]; rows: string[][]; totalLinesApprox: number } | null; mode: Mode }) {
  const start = () => void useWs.getState().startRuntime();
  const status = useWs((s) => s.runtime.status);
  const msg = useWs((s) => s.runtime.message);
  const starting = status === 'starting';
  const btn = <button className="btn primary sm" disabled={starting} onClick={start}>{starting ? <Loader2 size={12} className="spin" /> : <Play size={12} />}{starting ? (msg ?? 'Starting…') : 'Start runtime'}</button>;
  if (target.kind === 'var') {
    return <Empty icon={<Database size={26} />} title="Đối tượng trong bộ nhớ không còn tồn tại">Runtime đã dừng nên biến <span className="mono">{target.expr}</span> đã bị giải phóng. Chạy lại code tạo ra nó, hoặc lần sau hãy lưu thành artifact.<div style={{ marginTop: 10 }}>{btn}</div></Empty>;
  }
  return (
    <div className="col" style={{ gap: 0 }}>
      <div className="p-12">
        <div className="callout"><Info size={14} /><div className="grow">
          <b>Preview mode</b>: trình duyệt chỉ đọc {preview ? preview.rows.length : 0} dòng đầu, chưa suy luận kiểu dữ liệu. {mode !== 'table' ? 'Profile và Compare cần runtime.' : 'Khởi động runtime để phân trang toàn bộ, xem schema/profile và so sánh.'}
        </div>{btn}</div>
      </div>
      {preview ? (
        <>
          <DataTable columns={preview.header.map((h) => ({ name: h }))} rows={preview.rows} />
          <div className="xs dim p-8">≈ {preview.totalLinesApprox.toLocaleString()} dòng trong file</div>
        </>
      ) : <Empty title="Không có preview cho định dạng này">Khởi động runtime để đọc {basename(target.path)}.</Empty>}
    </div>
  );
}

function ProfileGrid({ profile, rows }: { profile: NonNullable<ProfileResult['profile']>; rows: number }) {
  return (
    <div className="profile-grid">
      {profile.columns.map((c) => {
        const pct = rows ? (c.missing / rows) * 100 : 0;
        return (
          <div key={c.name} className="pcol">
            <div className="pcol-h">
              <span className="mono strong ellipsis grow" title={c.name}>{c.name}</span>
              <span className="badge blue mono">{c.dtype}</span>
            </div>
            <div className="row xs muted wrap" style={{ gap: 10 }}>
              <span>missing <b className={c.missing ? 't-red' : ''}>{c.missing.toLocaleString()}</b> ({pct.toFixed(1)}%)</span>
              <span>unique <b>{c.unique?.toLocaleString() ?? '—'}</b></span>
            </div>
            {c.missing > 0 && <div className="meter" style={{ background: 'var(--tone-green)' }}><div style={{ width: `${pct}%`, background: 'var(--c-red)' }} /></div>}
            {c.kind === 'numeric' && c.mean !== undefined && (
              <>
                {c.hist && <MiniHist counts={c.hist.counts} width={236} />}
                <div className="kv xs" style={{ gridTemplateColumns: 'repeat(5, auto)', gap: '2px 10px' }}>
                  <span className="dim">min</span><span className="dim">median</span><span className="dim">mean</span><span className="dim">max</span><span className="dim">std</span>
                  <span className="num">{fmtNum(c.min, 2)}</span><span className="num">{fmtNum(c.median, 2)}</span><span className="num">{fmtNum(c.mean, 2)}</span><span className="num">{fmtNum(c.max, 2)}</span><span className="num">{fmtNum(c.std, 2)}</span>
                </div>
              </>
            )}
            {c.kind === 'datetime' && <div className="xs mono muted">{String(c.min)} → {String(c.max)}</div>}
            {c.kind === 'categorical' && c.top && (
              <div className="col gap-4">
                {c.top.map(([v, n]) => (
                  <div key={v} className="bar-row" style={{ gridTemplateColumns: '1fr 70px 46px' }}>
                    <span className="ellipsis mono" title={v}>{v}</span>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / Math.max(1, c.top![0][1])) * 100}%` }} /></div>
                    <span className="num dim" style={{ textAlign: 'right' }}>{n.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Compare({ target, current, currentProfile }: { target: DataTarget; current: ProfileResult; currentProfile: ProfileResult['profile'] | null }) {
  const files = useWs((s) => s.files);
  const artifacts = useWs((s) => s.artifacts);
  const vars = useWs((s) => s.runtime.vars);
  const artifact = target.kind === 'file' ? artifacts.find((a) => a.path === target.path) : undefined;
  const options = useMemo(() => [
    ...Object.keys(files).filter((p) => /\.(csv|tsv|parquet|jsonl)$/i.test(p) && !(target.kind === 'file' && p === target.path)).map((p) => `file:${p}`),
    ...vars.filter((v) => v.tabular && !(target.kind === 'var' && v.name === target.expr)).map((v) => `var:${v.name}`),
  ], [files, vars, target]);
  const lineageDefault = artifact?.inputs.find((i) => /\.(csv|tsv|parquet|jsonl)$/i.test(i));
  const [other, setOther] = useState<string>(lineageDefault ? `file:${lineageDefault}` : options[0] ?? '');
  const [od, setOd] = useState<ProfileResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!other) return;
    const c = getRuntimeClient();
    if (!c) return;
    setOd(null); setErr(null);
    const t: DataTarget = other.startsWith('file:') ? { kind: 'file', path: other.slice(5) } : { kind: 'var', expr: other.slice(4) };
    c.profile({ ...t, page: 0, pageSize: 15, profile: true }).then(setOd).catch((e) => setErr((e as Error).message));
  }, [other]);

  const before = od, bp = od?.profile, ap = currentProfile;
  const label = (k: string) => (k.startsWith('file:') ? k.slice(5) : `${k.slice(4)} (memory)`);
  const curLabel = target.kind === 'file' ? target.path : `${target.expr} (memory)`;
  const delta = (a?: number | null, b?: number | null) => {
    if (a == null || b == null) return null;
    const d = a - b;
    return <span className={`d ${d > 0 ? 'diff-pos' : d < 0 ? 'diff-neg' : 'dim'}`}>{d > 0 ? '+' : ''}{d.toLocaleString()}</span>;
  };
  const schema = useMemo(() => {
    if (!bp || !ap) return [];
    const names = Array.from(new Set([...bp.columns.map((c) => c.name), ...ap.columns.map((c) => c.name)]));
    return names.map((n) => {
      const b = bp.columns.find((c) => c.name === n), a = ap.columns.find((c) => c.name === n);
      const status = !b ? 'added' : !a ? 'removed' : b.dtype !== a.dtype ? 'type changed' : b.missing !== a.missing ? 'missing changed' : 'unchanged';
      return { n, b, a, status };
    });
  }, [bp, ap]);

  return (
    <div className="col" style={{ gap: 0 }}>
      <div className="p-12 row wrap">
        <span className="small muted">So sánh</span>
        <select className="select" style={{ minWidth: 300 }} value={other} onChange={(e) => setOther(e.target.value)} aria-label="Dataset to compare">
          {options.length === 0 && <option value="">Không có dataset khác</option>}
          {options.map((o) => <option key={o} value={o}>{label(o)}{lineageDefault && o === `file:${lineageDefault}` ? '  ← input theo lineage' : ''}</option>)}
        </select>
        <span className="small muted">→</span>
        <span className="path-chip"><span>{curLabel}</span></span>
        {lineageDefault && <span className="badge teal">mặc định chọn input từ lineage tự động</span>}
      </div>
      {err && <div className="p-12"><div className="callout red mono xs">{err}</div></div>}
      {!before && !err && other && <div className="p-16 muted center"><Loader2 className="spin" size={16} /></div>}
      {before && bp && ap && (
        <>
          <div className="compare-grid">
            <div className="card"><div className="card-h"><span className="badge outline">BEFORE</span><span className="mono xs ellipsis">{label(other)}</span></div>
              <div className="card-b dv-stats">
                <div className="stat"><span className="v">{before.shape[0].toLocaleString()}</span><span className="k">rows</span></div>
                <div className="stat"><span className="v">{before.shape[1]}</span><span className="k">cols</span></div>
                <div className="stat"><span className="v">{bp.duplicates ?? '—'}</span><span className="k">duplicates</span></div>
                <div className="stat"><span className="v">{bp.missingTotal.toLocaleString()}</span><span className="k">missing</span></div>
              </div></div>
            <div className="card" style={{ borderColor: 'var(--accent-line)' }}><div className="card-h"><span className="badge accent">AFTER</span><span className="mono xs ellipsis">{curLabel}</span></div>
              <div className="card-b dv-stats">
                <div className="stat"><span className="v">{current.shape[0].toLocaleString()}</span><span className="k">rows</span>{delta(current.shape[0], before.shape[0])}</div>
                <div className="stat"><span className="v">{current.shape[1]}</span><span className="k">cols</span>{delta(current.shape[1], before.shape[1])}</div>
                <div className="stat"><span className="v">{ap.duplicates ?? '—'}</span><span className="k">duplicates</span>{delta(ap.duplicates, bp.duplicates)}</div>
                <div className="stat"><span className="v">{ap.missingTotal.toLocaleString()}</span><span className="k">missing</span>{delta(ap.missingTotal, bp.missingTotal)}</div>
              </div></div>
          </div>
          <div style={{ padding: '0 12px 8px' }} className="xs muted">
            {before.shape[0] - current.shape[0] > 0 ? <><b className="t-red">{(before.shape[0] - current.shape[0]).toLocaleString()}</b> dòng ít hơn so với BEFORE. </> : null}
            Chênh lệch tính theo số lượng; muốn đối chiếu từng bản ghi cần có khoá (key) chung.
            {artifact && <> · AFTER được tạo bởi <span className="mono">{artifact.source}</span> lúc {fmtDateTime(artifact.updatedAt)} · lưu tại <span className="mono">{artifact.storage.uri}</span></>}
          </div>
          <div style={{ padding: '0 12px 16px' }}>
            <table className="list-table card" style={{ overflow: 'hidden' }}>
              <thead><tr><th>Column</th><th>dtype before</th><th>dtype after</th><th>missing before</th><th>missing after</th><th>status</th></tr></thead>
              <tbody>
                {schema.map((r) => (
                  <tr key={r.n}>
                    <td className="mono">{r.n}</td>
                    <td className="mono xs">{r.b?.dtype ?? '—'}</td>
                    <td className="mono xs">{r.a?.dtype ?? '—'}</td>
                    <td className="num">{r.b?.missing ?? '—'}</td>
                    <td className="num">{r.a?.missing ?? '—'}</td>
                    <td><span className={`badge ${r.status === 'unchanged' ? 'outline' : r.status === 'added' ? 'green' : r.status === 'removed' ? 'red' : 'amber'}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
