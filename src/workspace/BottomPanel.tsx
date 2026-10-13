import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ChevronDown, CircleDashed, Cpu, Info, ListTree, Play, Power, RotateCcw, ScrollText, SquareTerminal, Trash2, XCircle,
} from 'lucide-react';
import { useWs, type BottomView } from '../state/workspace';
import { RuntimeDot, RUNTIME_LABEL } from '../components/ui';
import { basename, fmtBytes, fmtDateTime, fmtDuration, fmtTime } from '../lib/format';
import { buildLineage } from './lineage';
import { RunStatusIcon, runLabel } from './Sidebar';
import type { RunRecord } from '../lib/types';

const TABS: { id: BottomView; label: string; icon: typeof Cpu }[] = [
  { id: 'repl', label: 'Terminal', icon: SquareTerminal },
  { id: 'runs', label: 'Executions', icon: ListTree },
  { id: 'problems', label: 'Problems', icon: AlertTriangle },
  { id: 'output', label: 'Output', icon: ScrollText },
  { id: 'runtime', label: 'Runtime', icon: Cpu },
];

export default function BottomPanel() {
  const view = useWs((s) => s.layout.bottomView);
  const problems = useProblems();
  const { setLayout } = useWs.getState();
  return (
    <div className="pane" style={{ background: 'var(--bg-0)' }}>
      <div className="bp-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} id={`bp-tab-${t.id}`} role="tab" aria-selected={view === t.id} className={`bp-tab ${view === t.id ? 'on' : ''}`} onClick={() => setLayout({ bottomView: t.id })}>
            <t.icon size={12} />{t.label}
            {t.id === 'problems' && problems.length > 0 && <span className="badge red">{problems.length}</span>}
          </button>
        ))}
        <div className="grow" />
        <button className="icon-btn sm" id="bp-collapse" title="Thu gọn panel (Ctrl+J)" onClick={() => setLayout({ bottomOpen: false })}><ChevronDown size={14} /></button>
      </div>
      <div className="pane-b">
        {view === 'repl' && <Repl />}
        {view === 'runs' && <RunsTable />}
        {view === 'problems' && <Problems items={problems} />}
        {view === 'output' && <Output />}
        {view === 'runtime' && <RuntimeInfoView />}
      </div>
    </div>
  );
}

/* ---------------- REPL ---------------- */
function Repl() {
  const runs = useWs((s) => s.runs);
  const status = useWs((s) => s.runtime.status);
  const [code, setCode] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const outRef = useRef<HTMLDivElement>(null);
  const repl = runs.filter((r) => r.kind === 'repl').slice(-60);
  useEffect(() => { outRef.current?.scrollTo({ top: outRef.current.scrollHeight }); }, [repl.length, repl[repl.length - 1]?.stdout, repl[repl.length - 1]?.status]);
  const submit = () => {
    const c = code.trim();
    if (!c) return;
    setHist((h) => [...h, c]); setHi(-1); setCode('');
    void useWs.getState().execute({ code: c, source: 'REPL', kind: 'repl' });
  };
  return (
    <div className="repl">
      <div className="repl-out" ref={outRef}>
        <div className="dim">Python REPL · chạy trong cùng runtime với notebook (chia sẻ biến). Biến tạo ở đây chỉ nằm trong bộ nhớ, không được lưu.</div>
        {repl.map((r) => (
          <div key={r.id} style={{ marginTop: 6 }}>
            <div><span className="t-accent">&gt;&gt;&gt; </span><span style={{ whiteSpace: 'pre-wrap' }}>{r.code}</span></div>
            {r.stdout && <pre className="stream">{r.stdout}</pre>}
            {r.stderr && <pre className="stream err">{r.stderr}</pre>}
            {r.result?.kind === 'text' && <pre className="stream">{r.result.text}</pre>}
            {r.result?.kind === 'dataframe' && <pre className="stream">{`<DataFrame ${r.result.shape[0]} × ${r.result.shape[1]}> — mở trong Data Viewer từ tab Data`}</pre>}
            {r.error && <pre className="stream err">{r.error.traceback.length ? r.error.traceback.join('') : `${r.error.ename}: ${r.error.evalue}`}</pre>}
            {r.status === 'running' && <span className="t-amber">… running</span>}
          </div>
        ))}
      </div>
      <div className="repl-in">
        <RuntimeDot status={status} />
        <span className="t-accent">&gt;&gt;&gt;</span>
        <input
          id="repl-input"
          value={code}
          placeholder={status === 'stopped' ? 'Nhập lệnh Python (runtime sẽ tự khởi động)…' : 'Nhập lệnh Python, Enter để chạy, ↑/↓ lịch sử'}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            else if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); const i = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1); setHi(i); setCode(hist[i]); }
            else if (e.key === 'ArrowDown' && hi >= 0) { e.preventDefault(); const i = hi + 1; if (i >= hist.length) { setHi(-1); setCode(''); } else { setHi(i); setCode(hist[i]); } }
          }}
          spellCheck={false}
          aria-label="Python REPL input"
        />
        <button className="icon-btn sm" title="Run" onClick={submit}><Play size={13} /></button>
      </div>
    </div>
  );
}

/* ---------------- Executions ---------------- */
function RunsTable() {
  const runs = useWs((s) => s.runs);
  const { openTab, select } = useWs.getState();
  const list = useMemo(() => [...runs].reverse().slice(0, 200), [runs]);
  const open = (r: RunRecord) => { openTab({ id: `run:${r.id}`, kind: 'run', title: `Run ${r.id.slice(-4)}`, ref: r.id }); select({ kind: 'run', ref: r.id }); };
  if (!list.length) return <div className="p-12 xs dim">Chưa có lần chạy nào. Chạy một cell, file .py, câu SQL hoặc lệnh REPL để xem tại đây.</div>;
  return (
    <table className="list-table" id="executions-table">
      <thead><tr><th style={{ width: 28 }} /><th>Source</th><th>Kind</th><th>Session</th><th>Started</th><th>Duration</th><th>Inputs</th><th>Outputs (persisted)</th><th>Result</th></tr></thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.id} className="clickable" onClick={() => open(r)}>
            <td><RunStatusIcon r={r} /></td>
            <td className="mono xs">{runLabel(r)}</td>
            <td><span className="badge outline">{r.kind}</span></td>
            <td className="mono xs dim">{r.sessionId || '—'}</td>
            <td className="num xs">{fmtTime(r.startedAt)}</td>
            <td className="num xs">{fmtDuration(r.durationMs)}</td>
            <td className="mono xs">{r.inputs.length ? r.inputs.map(basename).join(', ') : <span className="dim">—</span>}</td>
            <td className="mono xs">{r.outputs.length ? r.outputs.map(basename).join(', ') : <span className="dim">—</span>}</td>
            <td className="xs">
              {r.error ? <span className="t-red">{r.error.ename}: {r.error.evalue.slice(0, 60)}</span>
                : r.result?.kind === 'dataframe' ? <span className="t-violet">DataFrame {r.result.shape.join('×')} (memory)</span>
                : r.status === 'ok' ? <span className="t-green">exit 0</span> : <span className="dim">{r.status}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------- Problems ---------------- */
interface Problem { id: string; level: 'error' | 'warn' | 'info'; title: string; detail: string; action?: () => void; actionLabel?: string }

function useProblems(): Problem[] {
  const runs = useWs((s) => s.runs);
  const artifacts = useWs((s) => s.artifacts);
  const files = useWs((s) => s.files);
  const edges = useWs((s) => s.edges);
  const runtime = useWs((s) => s.runtime);
  const buffers = useWs((s) => s.buffers);
  const persistError = useWs((s) => s.persistError);
  return useMemo(() => {
    const st = useWs.getState();
    const out: Problem[] = [];
    if (persistError) out.push({ id: 'persist', level: 'error', title: 'Lỗi ghi storage', detail: persistError });
    if (runtime.status === 'error') out.push({ id: 'rt-err', level: 'error', title: 'Runtime gặp lỗi', detail: runtime.message ?? 'Không rõ nguyên nhân', action: () => void st.restartRuntime(), actionLabel: 'Restart' });
    if (runtime.status === 'restart-required') out.push({ id: 'rt-restart', level: 'warn', title: 'Cần khởi động lại runtime', detail: runtime.message ?? 'Module đã import bị thay đổi', action: () => void st.restartRuntime(), actionLabel: 'Restart' });
    // latest run per source failed
    const latest = new Map<string, RunRecord>();
    for (const r of runs) latest.set(`${r.source}#${r.cellIndex ?? ''}`, r);
    for (const r of latest.values()) {
      if (r.status === 'error') out.push({
        id: r.id, level: 'error', title: `${runLabel(r)} — ${r.error?.ename ?? 'Error'}`, detail: r.error?.evalue ?? '',
        action: () => { st.openTab({ id: `run:${r.id}`, kind: 'run', title: `Run ${r.id.slice(-4)}`, ref: r.id }); st.select({ kind: 'run', ref: r.id }); }, actionLabel: 'Inspect',
      });
    }
    for (const f of Object.values(files)) if (f.notSynced) out.push({ id: `ns:${f.path}`, level: 'error', title: `${f.path} chưa được lưu bền vững`, detail: `${fmtBytes(f.size)} vượt giới hạn đồng bộ; chỉ tồn tại trong runtime.` });
    const g = buildLineage(artifacts, files, runs, edges);
    for (const n of g.nodes) {
      if (n.stale) out.push({ id: `stale:${n.id}`, level: 'warn', title: `${basename(n.id)} có thể đã cũ (stale)`, detail: `Input mới hơn output: ${n.staleInputs.join(', ')}`, action: () => st.select({ kind: 'artifact', ref: n.id }), actionLabel: 'Show' });
    }
    for (const a of artifacts) if (!files[a.path]) out.push({ id: `miss:${a.path}`, level: 'warn', title: `Artifact ${a.path} không còn file`, detail: 'File đã bị xoá khỏi storage; metadata và lịch sử vẫn được giữ.' });
    const dirty = Object.keys(buffers).length;
    if (dirty) out.push({ id: 'dirty', level: 'info', title: `${dirty} file có thay đổi chưa ghi`, detail: Object.keys(buffers).join(', '), action: () => void st.saveAll(), actionLabel: 'Save all' });
    return out;
  }, [runs, artifacts, files, edges, runtime, buffers, persistError]);
}

function Problems({ items }: { items: Problem[] }) {
  if (!items.length) return <div className="p-12 xs dim">Không có vấn đề nào được phát hiện.</div>;
  return (
    <div>
      {items.map((p) => (
        <div key={p.id} className="list-item" style={{ cursor: 'default', padding: '5px 12px' }}>
          {p.level === 'error' ? <XCircle size={13} className="t-red" /> : p.level === 'warn' ? <AlertTriangle size={13} className="t-amber" /> : <Info size={13} className="t-blue" />}
          <div className="li-main"><span className="small">{p.title}</span><span className="xs dim ellipsis mono">{p.detail}</span></div>
          {p.action && <button className="btn sm" onClick={p.action}>{p.actionLabel}</button>}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Output ---------------- */
function Output() {
  const logs = useWs((s) => s.logs);
  const [level, setLevel] = useState<'all' | 'warn'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const list = logs.filter((l) => level === 'all' || l.level !== 'info');
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [list.length]);
  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="row" style={{ padding: '4px 10px', borderBottom: '1px solid var(--line)' }}>
        <span className="xs dim">Platform log: storage, runtime, upload, artifacts. Không chứa secrets.</span>
        <div className="grow" />
        <div className="seg"><button className={level === 'all' ? 'on' : ''} onClick={() => setLevel('all')}>All</button><button className={level === 'warn' ? 'on' : ''} onClick={() => setLevel('warn')}>Warn+</button></div>
        <button className="icon-btn sm" title="Clear (chỉ trên giao diện)" onClick={() => useWs.setState({ logs: [] })}><Trash2 size={12} /></button>
      </div>
      <div className="grow scroll" ref={ref} style={{ paddingTop: 4 }}>
        {list.map((l) => (
          <div key={l.id} className={`log-line ${l.level}`}><span className="dim">{fmtTime(l.at)}</span><span className="dim">[{l.source}]</span><span>{l.message}</span></div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Runtime info ---------------- */
function RuntimeInfoView() {
  const runtime = useWs((s) => s.runtime);
  const ws = useWs((s) => s.ws)!;
  const files = useWs((s) => s.files);
  const { startRuntime, stopRuntime, restartRuntime, refreshVars, openTab } = useWs.getState();
  const alive = runtime.status === 'running' || runtime.status === 'busy' || runtime.status === 'restart-required';
  return (
    <div className="grid-2 p-12" style={{ gap: 12 }}>
      <div className="col">
        <div className="row">
          <RuntimeDot status={runtime.status} /><span className="strong">{RUNTIME_LABEL[runtime.status]}</span>
          {runtime.message && <span className="xs muted ellipsis">{runtime.message}</span>}
          <div className="grow" />
          {!alive && runtime.status !== 'starting' && <button className="btn sm primary" id="rt-start" onClick={() => void startRuntime()}><Power size={12} />Start</button>}
          {alive && <button className="btn sm" id="rt-restart" onClick={() => void restartRuntime()}><RotateCcw size={12} />Restart</button>}
          {(alive || runtime.status === 'starting') && <button className="btn sm danger" id="rt-stop" onClick={stopRuntime}><Power size={12} />Stop</button>}
        </div>
        <dl className="kv">
          <dt>Session</dt><dd className="mono">{runtime.info.sessionId || '—'}</dd>
          <dt>Engine</dt><dd className="mono">{runtime.info.engine} {runtime.info.pyodideVersion ? `· Pyodide ${runtime.info.pyodideVersion}` : ''}</dd>
          <dt>Python</dt><dd className="mono">{runtime.info.python ?? '—'}</dd>
          <dt>Started</dt><dd>{runtime.info.startedAt ? fmtDateTime(runtime.info.startedAt) : '—'}</dd>
          <dt>WASM heap</dt><dd className="num">{runtime.info.heapMB != null ? `${runtime.info.heapMB} MB` : '—'} <span className="dim xs">/ profile {ws.runtimeProfile.memoryLimitMB} MB</span></dd>
          <dt>Image</dt><dd className="xs">{ws.runtimeProfile.image}</dd>
          <dt>Packages</dt><dd className="mono xs">{runtime.info.packages.length ? runtime.info.packages.join(', ') : '—'}</dd>
          <dt>Imported src</dt><dd className="mono xs">{runtime.workspaceModules.length ? runtime.workspaceModules.join(', ') : '—'}</dd>
          <dt>CPU / GPU</dt><dd className="xs dim">Không đo được trong runtime trình duyệt. Backend container sẽ báo cgroup metrics.</dd>
        </dl>
        <div className="callout teal xs"><CircleDashed size={14} /><div>Dừng runtime chỉ xoá <b>bộ nhớ</b> (biến, model chưa lưu). {Object.keys(files).length} file trong workspace storage, artifacts, notes và lịch sử chạy được giữ nguyên và nạp lại khi khởi động.</div></div>
      </div>
      <div className="col">
        <div className="row"><span className="upper">Variables in memory · ephemeral</span><div className="grow" />{alive && <button className="btn ghost sm" onClick={() => void refreshVars()}>Refresh</button>}</div>
        {!alive && <div className="xs dim">Runtime không chạy: không có biến nào.</div>}
        {alive && runtime.vars.length === 0 && <div className="xs dim">Chưa có biến.</div>}
        {runtime.vars.length > 0 && (
          <table className="list-table">
            <thead><tr><th>Name</th><th>Type</th><th>Shape</th><th>Size</th><th /></tr></thead>
            <tbody>
              {runtime.vars.map((v) => (
                <tr key={v.name}>
                  <td className="mono xs">{v.name}</td>
                  <td className="mono xs dim">{v.type}</td>
                  <td className="num xs">{v.shape?.join(' × ') ?? (v.repr ? <span className="dim ellipsis">{v.repr.slice(0, 40)}</span> : '—')}</td>
                  <td className="num xs">{v.bytes ? fmtBytes(v.bytes) : '—'}</td>
                  <td>{v.tabular && <button className="btn ghost sm" onClick={() => openTab({ id: `data:var:${v.name}`, kind: 'data', title: `${v.name} (memory)`, ref: `var:${v.name}` })}>View</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="xs dim">Muốn giữ lại? Ghi ra file (vd. <span className="mono">df.to_csv("artifacts/x.csv")</span>) hoặc dùng “Save as artifact” trong Data Viewer.</div>
      </div>
    </div>
  );
}
