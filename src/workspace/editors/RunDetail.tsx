import { useState } from 'react';
import { ArrowRight, Clock, Cpu, FileInput, FileOutput, StickyNote, TerminalSquare, ExternalLink, Trash2 } from 'lucide-react';
import { useWs } from '../../state/workspace';
import { DataTable, Empty } from '../../components/ui';
import { toast } from '../../components/dialogs';
import { fmtDuration, fmtDateTime } from '../../lib/format';
import { RunStatusIcon, runLabel } from '../Sidebar';

export default function RunDetail({ runId }: { runId: string }) {
  const run = useWs((s) => s.runs.find((r) => r.id === runId));
  const files = useWs((s) => s.files);
  const artifacts = useWs((s) => s.artifacts);
  const currentSession = useWs((s) => s.runtime.info.sessionId);
  const [tab, setTab] = useState<'stdout' | 'stderr' | 'system'>('stdout');
  if (!run) return <Empty icon={<TerminalSquare size={26} />} title="Không tìm thấy run">Run có thể đã bị cắt khỏi lịch sử (giữ 300 run gần nhất).</Empty>;
  const { openFile, select, updateNote, activeNoteId, notes } = { ...useWs.getState(), activeNoteId: useWs.getState().activeNoteId, notes: useWs.getState().notes };
  const linkToNote = () => {
    const n = notes.find((x) => x.id === activeNoteId) ?? notes[0];
    if (!n) return toast('Chưa có note nào để liên kết', 'warn');
    if (n.links.some((l) => l.kind === 'run' && l.ref === run.id)) return toast('Run đã được liên kết', 'info');
    updateNote(n.id, { links: [...n.links, { kind: 'run', ref: run.id, label: `${runLabel(run)} (${run.status})` }] });
    toast(`Đã liên kết run vào note "${n.title}"`, 'success');
  };
  const io = (paths: string[], kind: 'in' | 'out') => paths.length === 0
    ? <div className="xs dim">{kind === 'in' ? 'Không ghi nhận file nào được đọc.' : 'Không có file nào được ghi.'}</div>
    : paths.map((p) => {
      const a = artifacts.find((x) => x.path === p);
      return (
        <div key={p} className="row xs" style={{ padding: '3px 0' }}>
          {kind === 'in' ? <FileInput size={12} className="t-blue" /> : <FileOutput size={12} className="t-teal" />}
          <a href="#" className="mono" onClick={(e) => { e.preventDefault(); if (files[p]) openFile(p); select({ kind: a ? 'artifact' : 'file', ref: p }); }}>{p}</a>
          {files[p] ? <span className="badge teal">persisted</span> : <span className="badge red">not in storage</span>}
          {a && kind === 'out' && <span className="badge accent">artifact v{a.version}</span>}
        </div>
      );
    });

  return (
    <div className="scroll fill">
      <div className="toolbar" style={{ height: 46 }}>
        <RunStatusIcon r={run} size={16} />
        <span className="strong">{runLabel(run)}</span>
        <span className={`badge ${run.status === 'ok' ? 'green' : run.status === 'error' ? 'red' : run.status === 'running' ? 'amber' : 'outline'}`}>{run.status === 'ok' ? 'exit ok' : run.status}</span>
        <span className="badge outline">{run.kind}</span>
        <span className="mono xs dim">{run.id}</span>
        <div className="grow" />
        <button className="btn sm ghost" onClick={linkToNote}><StickyNote size={12} />Link to note</button>
        {run.source.includes('/') && files[run.source] && <button className="btn sm" onClick={() => openFile(run.source)}><ExternalLink size={12} />Open source</button>}
      </div>
      <div className="p-12 col gap-12">
        <div className="grid-4">
          <div className="metric-tile"><span className="k"><Clock size={11} /> Started</span><span className="num small">{fmtDateTime(run.startedAt)}</span></div>
          <div className="metric-tile"><span className="k">Ended</span><span className="num small">{run.endedAt ? fmtDateTime(run.endedAt) : '—'}</span></div>
          <div className="metric-tile"><span className="k">Duration</span><span className="v" style={{ fontSize: 18 }}>{fmtDuration(run.durationMs)}</span></div>
          <div className="metric-tile"><span className="k"><Cpu size={11} /> Runtime session</span><span className="num small">{run.sessionId || '—'} {run.sessionId === currentSession && run.sessionId ? <span className="badge green">current</span> : <span className="badge outline">ended</span>}</span><span className="xs dim">WASM heap after run: {run.heapMB != null ? `${run.heapMB} MB` : '—'}</span></div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Code</h3>{run.execCount != null && <span className="mono xs dim">exec #{run.execCount}</span>}</div>
          <pre className="stream" style={{ padding: 12, maxHeight: 280, overflow: 'auto' }}>{run.code}</pre>
        </div>

        <div className="grid-2">
          <div className="card"><div className="card-h"><FileInput size={14} className="t-blue" /><h3>Inputs</h3><span className="xs dim">files opened for reading</span></div><div className="card-b">{io(run.inputs, 'in')}</div></div>
          <div className="card"><div className="card-h"><FileOutput size={14} className="t-teal" /><h3>Outputs</h3><span className="xs dim">files written → synced to storage</span></div><div className="card-b">{io(run.outputs, 'out')}
            {run.deleted && run.deleted.length > 0 && run.deleted.map((p) => <div key={p} className="row xs t-red"><Trash2 size={12} />{p} deleted by code</div>)}
          </div></div>
        </div>
        {run.inputs.length > 0 && run.outputs.length > 0 && (
          <div className="row xs muted wrap"><span className="upper">captured lineage</span>{run.inputs.join(', ')}<ArrowRight size={12} />{run.outputs.join(', ')}</div>
        )}

        {run.error && (
          <div className="card" style={{ borderColor: 'hsl(357 82% 64% / 0.4)' }}>
            <div className="card-h"><h3 className="t-red">{run.error.ename}</h3><span className="xs muted">{run.error.evalue}</span></div>
            <div className="card-b">{run.error.traceback.length ? <pre className="tb">{run.error.traceback.join('')}</pre> : <span className="xs dim">Không có traceback.</span>}</div>
          </div>
        )}

        <div className="card">
          <div className="subtabs">
            <button className={tab === 'stdout' ? 'on' : ''} onClick={() => setTab('stdout')}>stdout <span className="dim num">{run.stdout.length}</span></button>
            <button className={tab === 'stderr' ? 'on' : ''} onClick={() => setTab('stderr')}>stderr <span className={`num ${run.stderr ? 't-red' : 'dim'}`}>{run.stderr.length}</span></button>
            <button className={tab === 'system' ? 'on' : ''} onClick={() => setTab('system')}>runtime log</button>
          </div>
          <pre className={`stream ${tab === 'stderr' ? 'err' : tab === 'system' ? 'sys' : ''}`} style={{ padding: 12, maxHeight: 300, overflow: 'auto', minHeight: 40 }}>{run[tab] || <span className="dim">(empty)</span>}</pre>
        </div>

        {run.result && (
          <div className="card">
            <div className="card-h"><h3>Return value</h3><span className="badge violet">◆ runtime memory · not persisted</span>{run.result.kind === 'dataframe' && <span className="num xs muted">{run.result.shape.join(' × ')} (snapshot of first rows)</span>}</div>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {run.result.kind === 'dataframe' ? <DataTable columns={run.result.columns} rows={run.result.rows} index={run.result.index} /> : <pre className="stream p-12">{run.result.text}</pre>}
            </div>
          </div>
        )}
        <div className="xs dim">Execution record lưu trong workspace storage. Biến được tạo trong bộ nhớ runtime không được coi là artifact cho tới khi bạn ghi chúng ra file.</div>
      </div>
    </div>
  );
}
