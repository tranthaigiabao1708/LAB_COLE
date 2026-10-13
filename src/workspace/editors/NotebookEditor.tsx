import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import {
  Play, PlayCircle, Plus, Trash2, ArrowUp, ArrowDown, Eraser, Loader2, Square, RotateCcw, Database, Save, FileOutput,
  TerminalSquare, Type, Code2, History, ExternalLink,
} from 'lucide-react';
import { useWs } from '../../state/workspace';
import { DataTable, Markdown, PathChip, RuntimeDot, RUNTIME_LABEL } from '../../components/ui';
import { confirmDialog, promptDialog, toast } from '../../components/dialogs';
import { cellTheme, SaveState, useFileContent } from './shared';
import { fmtDuration, fmtTime, basename } from '../../lib/format';
import type { DataFramePayload, RunRecord } from '../../lib/types';
import type { ExecResponse } from '../../adapters/runtime';

interface NbOutput {
  output_type: 'stream' | 'error' | 'execute_result' | 'display_data';
  name?: string; text?: string; ename?: string; evalue?: string; traceback?: string[];
  data?: Record<string, unknown>; execution_count?: number | null; metadata?: Record<string, unknown>;
}
interface AilabMeta { runId: string; sessionId: string; status: string; durationMs?: number; at: number; outputs: string[]; inputs: string[] }
interface NbCell {
  id: string; cell_type: 'code' | 'markdown' | 'raw'; source: string; metadata: { ailab?: AilabMeta; [k: string]: unknown };
  outputs?: NbOutput[]; execution_count?: number | null;
}
interface Nb { nbformat: number; nbformat_minor: number; metadata: Record<string, unknown>; cells: NbCell[] }

const DF_MIME = 'application/vnd.ailab.dataframe+json';
const newId = () => Math.random().toString(36).slice(2, 10);

function parseNb(text: string): Nb | null {
  try {
    const j = JSON.parse(text);
    if (!Array.isArray(j.cells)) return null;
    j.cells = j.cells.map((c: NbCell & { source: string | string[] }) => ({
      ...c, id: c.id ?? newId(), metadata: c.metadata ?? {},
      source: Array.isArray(c.source) ? c.source.join('') : c.source ?? '',
      ...(c.cell_type === 'code' ? { outputs: c.outputs ?? [], execution_count: c.execution_count ?? null } : {}),
    }));
    return j as Nb;
  } catch { return null; }
}

function toOutputs(res: ExecResponse, run: RunRecord): NbOutput[] {
  const out: NbOutput[] = [];
  if (run.stdout) out.push({ output_type: 'stream', name: 'stdout', text: run.stdout });
  if (run.stderr) out.push({ output_type: 'stream', name: 'stderr', text: run.stderr });
  if (res.error) out.push({ output_type: 'error', ename: res.error.ename, evalue: res.error.evalue, traceback: res.error.traceback });
  if (res.result) {
    const data: Record<string, unknown> = res.result.kind === 'dataframe'
      ? { [DF_MIME]: res.result, 'text/plain': `DataFrame ${res.result.shape.join(' × ')}` }
      : { 'text/plain': res.result.text };
    out.push({ output_type: 'execute_result', execution_count: res.execCount, data, metadata: {} });
  }
  for (const f of res.figures) out.push({ output_type: 'display_data', data: { 'image/png': f }, metadata: {} });
  return out;
}

export default function NotebookEditor({ path }: { path: string }) {
  const { content, loaded } = useFileContent(path);
  const [nb, setNb] = useState<Nb | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [editingMd, setEditingMd] = useState<string | null>(null);
  const [runningCell, setRunningCell] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const runtime = useWs((s) => s.runtime);
  const nbRef = useRef<Nb | null>(null);
  nbRef.current = nb;
  const stopAll = useRef(false);

  useEffect(() => {
    if (loaded && !nb) setNb(parseNb(content));
  }, [loaded, content, nb]);

  const commit = useCallback((next: Nb) => {
    nbRef.current = next;
    setNb(next);
    useWs.getState().setBuffer(path, JSON.stringify(next, null, 1));
  }, [path]);

  const patchCell = useCallback((id: string, patch: Partial<NbCell>) => {
    const cur = nbRef.current;
    if (!cur) return;
    commit({ ...cur, cells: cur.cells.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }, [commit]);

  const runCell = useCallback(async (id: string): Promise<boolean> => {
    const cur = nbRef.current;
    if (!cur) return false;
    const idx = cur.cells.findIndex((c) => c.id === id);
    const cell = cur.cells[idx];
    if (!cell || cell.cell_type !== 'code') return true;
    setRunningCell(id);
    patchCell(id, { outputs: [], execution_count: null });
    const { run, response } = await useWs.getState().execute({ code: cell.source, source: path, kind: 'cell', cellId: id, cellIndex: idx });
    setRunningCell(null);
    const outputs = response ? toOutputs(response, run) : [{ output_type: 'error' as const, ename: run.error?.ename ?? 'Error', evalue: run.error?.evalue ?? '', traceback: [] }];
    patchCell(id, {
      outputs, execution_count: response?.execCount ?? null,
      metadata: { ...cell.metadata, ailab: { runId: run.id, sessionId: run.sessionId, status: run.status, durationMs: run.durationMs, at: run.startedAt, outputs: run.outputs, inputs: run.inputs } },
    });
    return run.status === 'ok';
  }, [path, patchCell]);

  const runAndAdvance = useCallback((id: string) => {
    const cur = nbRef.current;
    if (!cur) return;
    const idx = cur.cells.findIndex((c) => c.id === id);
    const next = cur.cells[idx + 1];
    if (cur.cells[idx]?.cell_type === 'markdown') setEditingMd(null);
    else void runCell(id);
    if (next) setActive(next.id);
  }, [runCell]);

  const runAll = async (fromIdx = 0) => {
    const cur = nbRef.current;
    if (!cur) return;
    stopAll.current = false;
    const ids = cur.cells.slice(fromIdx).filter((c) => c.cell_type === 'code').map((c) => c.id);
    setQueue(ids);
    for (const id of ids) {
      if (stopAll.current) break;
      setQueue((q) => q.filter((x) => x !== id));
      const ok = await runCell(id);
      if (!ok) { toast('Dừng "Run all" vì một cell bị lỗi', 'warn'); break; }
    }
    setQueue([]);
  };

  const insert = (at: number, type: 'code' | 'markdown') => {
    const cur = nbRef.current;
    if (!cur) return;
    const cell: NbCell = type === 'code'
      ? { id: newId(), cell_type: 'code', source: '', metadata: {}, outputs: [], execution_count: null }
      : { id: newId(), cell_type: 'markdown', source: '', metadata: {} };
    const cells = [...cur.cells];
    cells.splice(at, 0, cell);
    commit({ ...cur, cells });
    setActive(cell.id);
    if (type === 'markdown') setEditingMd(cell.id);
  };
  const move = (id: string, d: number) => {
    const cur = nbRef.current;
    if (!cur) return;
    const i = cur.cells.findIndex((c) => c.id === id);
    const j = i + d;
    if (j < 0 || j >= cur.cells.length) return;
    const cells = [...cur.cells];
    [cells[i], cells[j]] = [cells[j], cells[i]];
    commit({ ...cur, cells });
  };
  const remove = (id: string) => {
    const cur = nbRef.current;
    if (!cur) return;
    commit({ ...cur, cells: cur.cells.filter((c) => c.id !== id) });
  };
  const clearOutputs = () => {
    const cur = nbRef.current;
    if (!cur) return;
    commit({ ...cur, cells: cur.cells.map((c) => (c.cell_type === 'code' ? { ...c, outputs: [], execution_count: null, metadata: { ...c.metadata, ailab: undefined } } : c)) });
  };
  const interrupt = async () => {
    if (!(await confirmDialog({ title: 'Dừng thực thi?', message: 'Runtime trong trình duyệt không thể ngắt giữa chừng, nên sẽ dừng toàn bộ runtime. Biến trong bộ nhớ sẽ mất. File đã lưu không bị ảnh hưởng.', confirmText: 'Stop runtime', danger: true }))) return;
    stopAll.current = true;
    useWs.getState().stopRuntime();
  };

  const keymaps = useMemo(() => (id: string) => Prec.highest(keymap.of([
    { key: 'Shift-Enter', run: () => { runAndAdvance(id); return true; } },
    { key: 'Ctrl-Enter', run: () => { void runCell(id); return true; } },
    { key: 'Mod-Enter', run: () => { void runCell(id); return true; } },
  ])), [runAndAdvance, runCell]);

  if (!loaded) return <div className="center fill muted"><Loader2 className="spin" size={16} /></div>;
  if (!nb) return <div className="p-16"><div className="callout red">Không đọc được notebook (JSON không hợp lệ). Mở bằng code editor để sửa.</div></div>;

  const busy = !!runningCell || queue.length > 0;
  const alive = runtime.status === 'running' || runtime.status === 'busy' || runtime.status === 'restart-required';

  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="toolbar">
        <PathChip path={path} />
        <SaveState path={path} />
        <div className="sep" />
        <button className="btn sm primary" id="nb-run-all" disabled={busy} onClick={() => void runAll()}><PlayCircle size={13} />Run all</button>
        <button className="btn sm" disabled={busy || !active} onClick={() => active && void runCell(active)} title="Ctrl+Enter"><Play size={13} />Run cell</button>
        <button className="btn sm ghost" disabled={!busy && runtime.status !== 'starting'} onClick={() => void interrupt()}><Square size={12} />Stop</button>
        <button className="btn sm ghost" disabled={!alive || busy} onClick={() => void useWs.getState().restartRuntime()} title="Restart runtime (xoá bộ nhớ)"><RotateCcw size={13} />Restart</button>
        <button className="btn sm ghost" onClick={clearOutputs}><Eraser size={13} />Clear outputs</button>
        <div className="grow" />
        <span className="row xs muted" title={runtime.message}><RuntimeDot status={runtime.status} />Python 3 · {RUNTIME_LABEL[runtime.status]}{runtime.status === 'starting' && runtime.message ? ` · ${runtime.message}` : ''}</span>
      </div>
      <div className="grow scroll" style={{ minHeight: 0 }}>
        {runtime.status === 'stopped' && (
          <div style={{ padding: '10px 24px 0 68px' }}>
            <div className="callout xs"><TerminalSquare size={14} /><div>Runtime đang dừng. Lần chạy đầu tiên sẽ tự khởi động runtime (tải Python + pandas lần đầu mất khoảng 10–30 giây). Output bên dưới (nếu có) là kết quả đã lưu từ các phiên trước.</div></div>
          </div>
        )}
        <div className="nb">
          {nb.cells.map((cell, i) => {
            const isActive = active === cell.id;
            const running = runningCell === cell.id;
            const queued = queue.includes(cell.id);
            const meta = cell.metadata.ailab;
            const errored = meta?.status === 'error';
            return (
              <div key={cell.id} className={`cell ${isActive ? 'active' : ''} ${running ? 'running' : ''} ${errored ? 'errored' : ''}`} onClick={() => setActive(cell.id)}>
                <div className="cell-gutter">
                  {cell.cell_type === 'code' ? (
                    <>
                      <button className="run" title="Run cell (Shift+Enter)" onClick={(e) => { e.stopPropagation(); void runCell(cell.id); }} disabled={busy}>
                        {running ? <Loader2 size={12} className="spin t-amber" /> : <Play size={11} />}
                      </button>
                      <span>[{running ? '*' : queued ? '…' : cell.execution_count ?? ' '}]</span>
                    </>
                  ) : <Type size={13} className="dim" style={{ marginTop: 4 }} />}
                </div>
                <div className="cell-main">
                  <div className="cell-tools">
                    <button className="icon-btn sm" title="Move up" onClick={() => move(cell.id, -1)}><ArrowUp size={12} /></button>
                    <button className="icon-btn sm" title="Move down" onClick={() => move(cell.id, 1)}><ArrowDown size={12} /></button>
                    <button className="icon-btn sm" title={cell.cell_type === 'code' ? 'Convert to markdown' : 'Convert to code'} onClick={() => patchCell(cell.id, cell.cell_type === 'code' ? { cell_type: 'markdown', outputs: undefined, execution_count: undefined } : { cell_type: 'code', outputs: [], execution_count: null })}>{cell.cell_type === 'code' ? <Type size={12} /> : <Code2 size={12} />}</button>
                    <button className="icon-btn sm" title="Insert code cell below" onClick={() => insert(i + 1, 'code')}><Plus size={12} /></button>
                    <button className="icon-btn sm" title="Delete cell" onClick={() => remove(cell.id)}><Trash2 size={12} /></button>
                  </div>
                  {cell.cell_type === 'markdown' && editingMd !== cell.id ? (
                    <div className="cell-md" onDoubleClick={() => setEditingMd(cell.id)} title="Double-click để sửa">
                      {cell.source.trim() ? <Markdown source={cell.source} /> : <span className="dim small">Markdown trống. Double-click để sửa.</span>}
                    </div>
                  ) : (
                    <CodeMirror
                      value={cell.source}
                      theme={cellTheme}
                      extensions={[cell.cell_type === 'code' ? python() : markdown(), keymaps(cell.id)]}
                      basicSetup={{ lineNumbers: cell.cell_type === 'code', foldGutter: false, highlightActiveLine: false }}
                      onChange={(v) => patchCell(cell.id, { source: v })}
                      onFocus={() => setActive(cell.id)}
                      autoFocus={editingMd === cell.id}
                    />
                  )}
                  {cell.cell_type === 'code' && <CellOutput cell={cell} running={running} path={path} />}
                </div>
              </div>
            );
          })}
          <div className="nb-add">
            <button className="btn sm ghost" onClick={() => insert(nb.cells.length, 'code')}><Plus size={12} />Code</button>
            <button className="btn sm ghost" onClick={() => insert(nb.cells.length, 'markdown')}><Plus size={12} />Markdown</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CellOutput({ cell, running, path }: { cell: NbCell; running: boolean; path: string }) {
  const liveRun = useWs((s) => (running ? s.runs.findLast((r) => r.cellId === cell.id && r.status === 'running') : undefined));
  const sessionId = useWs((s) => s.runtime.info.sessionId);
  const status = useWs((s) => s.runtime.status);
  const files = useWs((s) => s.files);
  const artifacts = useWs((s) => s.artifacts);
  const meta = cell.metadata.ailab;
  const outputs = cell.outputs ?? [];
  if (running) {
    return (
      <div className="cell-out">
        <div className="out-meta"><Loader2 size={11} className="spin t-amber" />Đang chạy trong runtime {sessionId}…</div>
        {liveRun?.system && <pre className="stream sys">{liveRun.system}</pre>}
        {liveRun?.stdout && <pre className="stream">{liveRun.stdout}</pre>}
        {liveRun?.stderr && <pre className="stream err">{liveRun.stderr}</pre>}
      </div>
    );
  }
  if (!outputs.length && !meta) return null;
  const sameSession = !!meta && meta.sessionId === sessionId && status !== 'stopped';
  const { openTab, select } = useWs.getState();
  return (
    <div className="cell-out">
      {meta && (
        <div className="out-meta">
          <span className={meta.status === 'ok' ? 't-green' : 't-red'}>{meta.status}</span>
          <span>· {fmtDuration(meta.durationMs)}</span>
          <span>· {fmtTime(meta.at)}</span>
          {!sameSession && <span className="badge outline" title="Output được lưu trong file notebook từ một phiên runtime trước. Biến của phiên đó không còn trong bộ nhớ."><History size={10} />earlier session {meta.sessionId}</span>}
          <button className="btn ghost sm" onClick={() => { openTab({ id: `run:${meta.runId}`, kind: 'run', title: `Run ${meta.runId.slice(-4)}`, ref: meta.runId }); select({ kind: 'run', ref: meta.runId }); }}><ExternalLink size={11} />Execution</button>
        </div>
      )}
      {outputs.map((o, k) => {
        if (o.output_type === 'stream') return <pre key={k} className={`stream ${o.name === 'stderr' ? 'err' : ''}`}>{o.text}</pre>;
        if (o.output_type === 'error') return <pre key={k} className="tb">{(o.traceback?.length ? o.traceback.join('') : `${o.ename}: ${o.evalue}`)}</pre>;
        if (o.output_type === 'display_data' && o.data?.['image/png']) {
          return (
            <div key={k} className="col gap-4">
              <img className="figure-out" src={`data:image/png;base64,${o.data['image/png']}`} alt="matplotlib figure" style={{ maxWidth: 640 }} />
              <span className="xs dim">Figure hiển thị trong output. Chưa phải artifact; dùng <span className="mono">fig.savefig(...)</span> để lưu bền vững.</span>
            </div>
          );
        }
        if (o.output_type === 'execute_result') {
          const df = o.data?.[DF_MIME] as DataFramePayload | undefined;
          if (df) return <DfResult key={k} df={df} live={sameSession} path={path} />;
          return <pre key={k} className="stream">{String(o.data?.['text/plain'] ?? '')}</pre>;
        }
        return null;
      })}
      {meta && meta.outputs.length > 0 && (
        <div className="col gap-4">
          <span className="upper">Files written by this cell → persisted</span>
          {meta.outputs.map((p) => {
            const a = artifacts.find((x) => x.path === p);
            return (
              <div key={p} className="row xs">
                <FileOutput size={12} className="t-teal" />
                <a className="mono" href="#" onClick={(e) => { e.preventDefault(); if (files[p]) useWs.getState().openFile(p); select({ kind: a ? 'artifact' : 'file', ref: p }); }}>{p}</a>
                {files[p] ? <span className="badge teal">persisted</span> : <span className="badge red">missing</span>}
                {a && <span className="badge accent">artifact v{a.version}</span>}
              </div>
            );
          })}
        </div>
      )}
      {meta && meta.inputs.length > 0 && (
        <div className="xs dim">Inputs read: {meta.inputs.map((p) => <span key={p} className="mono" style={{ marginRight: 8 }}>{basename(p)}</span>)}</div>
      )}
    </div>
  );
}

function DfResult({ df, live }: { df: DataFramePayload; live: boolean; path: string }) {
  const { openTab, execute } = useWs.getState();
  const ref = df.ref;
  const saveAs = async () => {
    if (!ref) return;
    const def = `artifacts/${ref.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'frame'}.csv`;
    const p = await promptDialog({ title: `Lưu ${ref} thành artifact`, label: 'Đường dẫn (CSV)', defaultValue: def, validate: (v) => (/^[\w\-./]+\.csv$/.test(v) && !v.includes('..') ? null : 'Cần đường dẫn tương đối kết thúc bằng .csv') });
    if (!p) return;
    const code = `import os as _os\n_os.makedirs(_os.path.dirname(${JSON.stringify(p)}) or ".", exist_ok=True)\n${ref}.to_csv(${JSON.stringify(p)}, index=False)\nprint("saved", ${JSON.stringify(p)}, ${ref}.shape)`;
    const { run } = await execute({ code, source: 'Save DataFrame as artifact', kind: 'action' });
    toast(run.status === 'ok' ? `Đã lưu ${p} (persisted + đăng ký artifact)` : `Lỗi: ${run.error?.evalue}`, run.status === 'ok' ? 'success' : 'error');
  };
  return (
    <div className="df-card">
      <div className="df-card-h">
        <Database size={12} className="t-violet" />
        <span className="mono strong">{ref ?? 'DataFrame'}</span>
        <span className="num muted">{df.shape[0].toLocaleString()} rows × {df.shape[1]} cols</span>
        {df.missing > 0 && <span className="badge red">{df.missing.toLocaleString()} missing</span>}
        <span className="badge violet" title="Kết quả nằm trong RAM của runtime. Sẽ mất khi dừng/khởi động lại runtime.">◆ in memory · not persisted</span>
        <div className="grow" />
        <button className="btn sm" disabled={!live || !ref} title={live ? 'Mở trong Data Viewer (profile, phân trang)' : 'Biến thuộc phiên runtime trước, không còn trong bộ nhớ'} onClick={() => ref && openTab({ id: `data:var:${ref}`, kind: 'data', title: `${ref} (memory)`, ref: `var:${ref}` })}><Database size={12} />Data Viewer</button>
        <button className="btn sm" disabled={!live || !ref} onClick={() => void saveAs()}><Save size={12} />Save as artifact</button>
      </div>
      <div className="df-scroll">
        <DataTable columns={df.columns} rows={df.rows} index={df.index} />
      </div>
      {df.truncated && <div className="xs dim" style={{ padding: '4px 8px' }}>Hiển thị {df.rows.length} / {df.shape[0].toLocaleString()} dòng. Mở Data Viewer để phân trang, xem profile và so sánh.</div>}
    </div>
  );
}
