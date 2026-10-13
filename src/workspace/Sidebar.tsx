import { useMemo, useState } from 'react';
import {
  BookOpen, Boxes, BrainCircuit, Cable, CheckCircle2, Circle, CircleDashed, CircleDot, Clock, Database, ExternalLink, FileText,
  GitBranch, Globe, KeyRound, Link2, Loader2, Pin, Plus, Server, StickyNote, Trash2, XCircle, AlertTriangle, Cpu, HardDrive, Rocket,
} from 'lucide-react';
import { useWs } from '../state/workspace';
import { templateById } from '../adapters/templates';
import { storage } from '../adapters/storage';
import Explorer from './Explorer';
import { ArtifactIcon, ArtifactTypeBadge, Empty, FileIcon, RuntimeDot, RUNTIME_LABEL } from '../components/ui';
import { basename, fmtBytes, fmtDuration, fmtNum, fmtTime, relTime } from '../lib/format';
import type { NoteStatus, RunRecord } from '../lib/types';
import { buildLineage } from './lineage';
import { promptDialog } from '../components/dialogs';

export default function Sidebar() {
  const view = useWs((s) => s.layout.sidebarView);
  switch (view) {
    case 'explorer': return <Explorer />;
    case 'labs': return <LabsView />;
    case 'data': return <DataView />;
    case 'runs': return <RunsView />;
    case 'artifacts': return <ArtifactsView />;
    case 'lineage': return <LineageSide />;
    case 'models': return <ModelsView />;
    case 'connections': return <ConnectionsView />;
    case 'notes': return <NotesView />;
  }
}

function Pane({ title, actions, children, footer }: { title: string; actions?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="pane">
      <div className="pane-h"><span className="title">{title}</span><div className="grow" />{actions}</div>
      <div className="pane-b">{children}</div>
      {footer}
    </div>
  );
}

/* ---------------- Labs & Docs ---------------- */
function LabsView() {
  const ws = useWs((s) => s.ws)!;
  const files = useWs((s) => s.files);
  const tpl = templateById(ws.templateId);
  const docs = Object.keys(files).filter((p) => p.endsWith('.md')).sort();
  const { openTab, setLayout, openFile } = useWs.getState();
  return (
    <Pane title="Labs & Docs">
      <div className="group-h"><BookOpen size={11} />Từ giáo viên / vận hành · read-only</div>
      {tpl?.labs.map((l) => (
        <div key={l.id} className="list-item" onClick={() => openTab({ id: `lab:${l.id}`, kind: 'lab', title: l.title.replace(/^.*· /, ''), ref: l.id })}>
          <FileText size={14} className={l.kind === 'lab' ? 't-accent' : 't-blue'} style={{ marginTop: 2 }} />
          <div className="li-main">
            <span className="ellipsis">{l.title}</span>
            <span className="xs dim">{l.author} · {l.kind === 'lab' ? 'gợi ý thực hành, không bắt buộc' : 'tài liệu'}</span>
          </div>
          <button className="icon-btn sm" title="Ghim vào panel phải để đọc song song" onClick={(e) => { e.stopPropagation(); setLayout({ rightOpen: true, rightView: 'docs', docRef: `lab:${l.id}` }); }}><Pin size={13} /></button>
        </div>
      ))}
      <div className="group-h"><FileText size={11} />Docs trong workspace</div>
      {docs.map((p) => (
        <div key={p} className="list-item" onClick={() => openFile(p)}>
          <FileIcon path={p} />
          <div className="li-main"><span className="ellipsis mono small">{p}</span></div>
          <button className="icon-btn sm" title="Ghim vào panel phải" onClick={(e) => { e.stopPropagation(); setLayout({ rightOpen: true, rightView: 'docs', docRef: `file:${p}` }); }}><Pin size={13} /></button>
        </div>
      ))}
    </Pane>
  );
}

/* ---------------- Data ---------------- */
const TABULAR = /\.(csv|tsv|parquet|pq|jsonl|ndjson)$/i;
function DataView() {
  const files = useWs((s) => s.files);
  const artifacts = useWs((s) => s.artifacts);
  const runtime = useWs((s) => s.runtime);
  const { openFile, openTab, setLayout, refreshVars } = useWs.getState();
  const tab = Object.keys(files).filter((p) => TABULAR.test(p)).sort();
  const raw = tab.filter((p) => !artifacts.some((a) => a.path === p));
  const derived = artifacts.filter((a) => a.type === 'dataset' && files[a.path]);
  const frames = runtime.vars.filter((v) => v.tabular);
  const alive = runtime.status === 'running' || runtime.status === 'busy' || runtime.status === 'restart-required';
  return (
    <Pane title="Data">
      <div className="group-h"><HardDrive size={11} />Source datasets · persisted</div>
      {raw.length === 0 && <div className="p-12 xs dim">Không có dataset nguồn.</div>}
      {raw.map((p) => (
        <div key={p} className="list-item" onClick={() => openFile(p)}>
          <FileIcon path={p} />
          <div className="li-main"><span className="ellipsis mono small">{basename(p)}</span><span className="xs dim ellipsis">{p} · {fmtBytes(files[p].size)} · {files[p].origin}</span></div>
        </div>
      ))}
      <div className="group-h"><Boxes size={11} />Derived datasets · artifacts</div>
      {derived.length === 0 && <div className="p-12 xs dim">Chưa có. File bảng do code ghi ra (vd. <span className="mono">df.to_csv(...)</span>) sẽ xuất hiện ở đây.</div>}
      {derived.map((a) => (
        <div key={a.id} className="list-item" onClick={() => openFile(a.path)}>
          <ArtifactIcon type={a.type} />
          <div className="li-main"><span className="ellipsis mono small">{basename(a.path)}</span><span className="xs dim ellipsis">v{a.version} · {fmtBytes(a.size)} · {relTime(a.updatedAt)}</span></div>
        </div>
      ))}
      <div className="group-h" style={{ color: 'var(--c-violet)' }}>
        <CircleDashed size={11} />In runtime memory · ephemeral
        <div className="grow" />
        {alive && <button className="btn ghost sm" onClick={() => void refreshVars()}>Refresh</button>}
      </div>
      {!alive && <div className="p-12 xs dim">Runtime {RUNTIME_LABEL[runtime.status].toLowerCase()}. Không có object nào trong bộ nhớ.</div>}
      {alive && frames.length === 0 && <div className="p-12 xs dim">Chưa có DataFrame nào trong bộ nhớ.</div>}
      {frames.map((v) => (
        <div key={v.name} className="list-item" onClick={() => openTab({ id: `data:var:${v.name}`, kind: 'data', title: `${v.name} (memory)`, ref: `var:${v.name}` })}>
          <span className="t-violet" style={{ marginTop: 1 }}>◆</span>
          <div className="li-main"><span className="mono small">{v.name}</span><span className="xs dim">{v.type} · {v.shape?.join(' × ')} · ~{fmtBytes(v.bytes)} · not persisted</span></div>
        </div>
      ))}
      <div className="group-h"><Server size={11} />External sources</div>
      <div className="list-item" onClick={() => setLayout({ sidebarView: 'connections' })}>
        <Database size={14} className="dim" />
        <div className="li-main"><span className="small">cole_labs_warehouse (PostgreSQL)</span><span className="xs dim">Chưa kết nối · cần backend connector</span></div>
      </div>
    </Pane>
  );
}

/* ---------------- Runs ---------------- */
export function RunStatusIcon({ r, size = 14 }: { r: RunRecord; size?: number }) {
  if (r.status === 'running') return <Loader2 size={size} className="spin t-amber" />;
  if (r.status === 'ok') return <CheckCircle2 size={size} className="t-green" />;
  if (r.status === 'error') return <XCircle size={size} className="t-red" />;
  return <CircleDashed size={size} className="dim" />;
}
export const runLabel = (r: RunRecord) => `${basename(r.source)}${r.cellIndex != null ? ` · cell ${r.cellIndex + 1}` : ''}`;

function RunsView() {
  const runs = useWs((s) => s.runs);
  const [filter, setFilter] = useState<'all' | 'error'>('all');
  const list = [...runs].reverse().filter((r) => filter === 'all' || r.status === 'error' || r.status === 'cancelled');
  const { openTab, select } = useWs.getState();
  return (
    <Pane title="Runs" actions={<div className="seg"><button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button><button className={filter === 'error' ? 'on' : ''} onClick={() => setFilter('error')}>Failed</button></div>}>
      {list.length === 0 && <Empty icon={<Clock size={24} />} title="Chưa có lần chạy nào">Mỗi lần chạy cell, file, SQL hoặc REPL đều được ghi lại kèm log, input/output và thời gian.</Empty>}
      {list.map((r) => (
        <div key={r.id} className="list-item" onClick={() => { openTab({ id: `run:${r.id}`, kind: 'run', title: `Run ${r.id.slice(-4)}`, ref: r.id }); select({ kind: 'run', ref: r.id }); }}>
          <RunStatusIcon r={r} />
          <div className="li-main">
            <span className="ellipsis small">{runLabel(r)}</span>
            <span className="xs dim">{r.kind} · {fmtTime(r.startedAt)} · {fmtDuration(r.durationMs)}{r.outputs.length ? ` · ${r.outputs.length} output` : ''}</span>
          </div>
        </div>
      ))}
    </Pane>
  );
}

/* ---------------- Artifacts ---------------- */
function ArtifactsView() {
  const artifacts = useWs((s) => s.artifacts);
  const files = useWs((s) => s.files);
  const { openTab, select, openFile } = useWs.getState();
  const sorted = [...artifacts].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <Pane title="Artifacts" actions={<button className="btn sm" id="open-artifact-browser" onClick={() => openTab({ id: 'artifacts', kind: 'artifacts', title: 'Artifact Browser' })}><ExternalLink size={12} />Browser</button>}>
      {sorted.length === 0 && <Empty icon={<Boxes size={24} />} title="Chưa có artifact">File do code ghi ra trong runtime (trừ .py/.ipynb/.md) sẽ tự động được lưu và đăng ký tại đây, kèm lineage.</Empty>}
      {sorted.map((a) => (
        <div key={a.id} className="list-item" onClick={() => { select({ kind: 'artifact', ref: a.path }); if (files[a.path]) openFile(a.path); }}>
          <ArtifactIcon type={a.type} />
          <div className="li-main">
            <span className="ellipsis mono small">{basename(a.path)}</span>
            <span className="xs dim ellipsis">v{a.version} · {fmtBytes(a.size)} · {relTime(a.updatedAt)}</span>
          </div>
          {files[a.path] ? <ArtifactTypeBadge type={a.type} /> : <span className="badge red">missing</span>}
        </div>
      ))}
    </Pane>
  );
}

/* ---------------- Lineage (side) ---------------- */
function LineageSide() {
  const artifacts = useWs((s) => s.artifacts);
  const files = useWs((s) => s.files);
  const runs = useWs((s) => s.runs);
  const edges = useWs((s) => s.edges);
  const g = useMemo(() => buildLineage(artifacts, files, runs, edges), [artifacts, files, runs, edges]);
  const { openTab, addEdge, removeEdge, select } = useWs.getState();
  const [from, setFrom] = useState('');
  const paths = Object.keys(files).sort();
  const auto = g.edges.filter((e) => e.kind === 'auto');
  const stale = g.nodes.filter((n) => n.stale);
  const add = async () => {
    if (!from) return;
    const to = await promptDialog({ title: 'Thêm liên kết thủ công', label: 'Đích: đường dẫn file hoặc tên bước (vd. "Prediction API")', defaultValue: '', validate: (v) => (v.trim() ? null : 'Bắt buộc') });
    if (!to) return;
    const label = await promptDialog({ title: 'Mô tả liên kết', label: 'Nhãn', defaultValue: 'manual' });
    addEdge(from, to.trim(), label || 'manual');
  };
  return (
    <Pane title="Lineage" actions={<button className="btn sm" id="open-lineage" onClick={() => openTab({ id: 'lineage', kind: 'lineage', title: 'Lineage' })}><GitBranch size={12} />Graph</button>}>
      <div className="p-12 col">
        <div className="callout teal xs"><GitBranch size={14} /><div><b>Auto</b>: runtime ghi nhận file đọc/ghi qua <span className="mono">open()</span>/pandas trong cùng một lần chạy. <b>Manual</b>: liên kết do bạn khai báo, hiển thị nét đứt.</div></div>
        <div className="row xs muted"><span>{g.nodes.length} nodes</span>·<span>{auto.length} auto edges</span>·<span>{edges.length} manual</span></div>
      </div>
      {stale.length > 0 && <>
        <div className="group-h t-amber"><AlertTriangle size={11} />Stale: input đã thay đổi sau khi output được tạo</div>
        {stale.map((n) => (
          <div key={n.id} className="list-item" onClick={() => select({ kind: 'artifact', ref: n.id })}>
            <AlertTriangle size={13} className="t-amber" />
            <div className="li-main"><span className="mono small ellipsis">{basename(n.id)}</span><span className="xs dim ellipsis">input mới hơn: {n.staleInputs.map(basename).join(', ')}</span></div>
          </div>
        ))}
      </>}
      <div className="group-h"><Link2 size={11} />Manual links</div>
      <div className="p-8 row">
        <select className="select grow" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Nguồn">
          <option value="">Chọn nguồn…</option>
          {paths.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn sm" disabled={!from} onClick={() => void add()}><Plus size={12} />Link</button>
      </div>
      {edges.map((e) => (
        <div key={e.id} className="list-item">
          <Link2 size={13} className="t-violet" />
          <div className="li-main"><span className="mono xs ellipsis">{e.from}</span><span className="mono xs ellipsis">→ {e.to}</span><span className="xs dim">{e.label}</span></div>
          <button className="icon-btn sm" onClick={() => removeEdge(e.id)} title="Remove"><Trash2 size={12} /></button>
        </div>
      ))}
    </Pane>
  );
}

/* ---------------- Models & experiments ---------------- */
function ModelsView() {
  const experiments = useWs((s) => s.experiments);
  const artifacts = useWs((s) => s.artifacts);
  const { openTab, select } = useWs.getState();
  const models = artifacts.filter((a) => a.type === 'model');
  return (
    <Pane title="Models & Experiments" actions={<button className="btn sm" id="open-experiments" onClick={() => openTab({ id: 'experiments', kind: 'experiments', title: 'Experiments' })}><ExternalLink size={12} />Compare</button>}>
      <div className="group-h"><BrainCircuit size={11} />Model registry (model artifacts)</div>
      {models.length === 0 && <div className="p-12 xs dim">Chưa có model. Dùng <span className="mono">lab.save_model(model, "models/x.pkl")</span> hoặc tự ghi file .pkl/.onnx/.pt.</div>}
      {models.map((m) => {
        const exp = experiments.find((e) => e.model_path === m.path);
        return (
          <div key={m.id} className="list-item" onClick={() => select({ kind: 'artifact', ref: m.path })}>
            <ArtifactIcon type="model" />
            <div className="li-main"><span className="mono small ellipsis">{basename(m.path)}</span><span className="xs dim">v{m.version} · {fmtBytes(m.size)}{exp ? ` · ${exp.model_type}` : ''}</span></div>
          </div>
        );
      })}
      <div className="group-h"><CircleDot size={11} />Experiments (experiments/*.json)</div>
      {experiments.length === 0 && <div className="p-12 xs dim">Chưa có. Gọi <span className="mono">lab.log_experiment(name, metrics, …)</span> trong code để ghi lại.</div>}
      {experiments.map((e) => {
        const k = ['roc_auc', 'pr_auc', 'f1'].find((m) => m in e.metrics) ?? Object.keys(e.metrics)[0];
        return (
          <div key={e.id} className="list-item" onClick={() => { select({ kind: 'experiment', ref: e.id }); openTab({ id: 'experiments', kind: 'experiments', title: 'Experiments' }); }}>
            <CircleDot size={13} className="t-amber" />
            <div className="li-main"><span className="small ellipsis">{e.name}</span><span className="xs dim">{e.model_type} · {relTime(e.created_at * 1000)}</span></div>
            {k && <span className="badge outline num">{k} {fmtNum(e.metrics[k])}</span>}
          </div>
        );
      })}
    </Pane>
  );
}

/* ---------------- Connections & APIs ---------------- */
function ConnectionsView() {
  const runtime = useWs((s) => s.runtime);
  const { openTab } = useWs.getState();
  const alive = runtime.status === 'running' || runtime.status === 'busy' || runtime.status === 'restart-required';
  const rows: { icon: typeof Cpu; name: string; detail: string; status: 'ok' | 'warn' | 'off'; label: string }[] = [
    { icon: HardDrive, name: 'Workspace storage', detail: `${storage.backend} · files, artifacts, runs, notes`, status: 'ok', label: 'Connected' },
    { icon: Cpu, name: 'Python runtime', detail: 'Pyodide 0.26 · Web Worker · isolated per tab', status: alive ? 'ok' : runtime.status === 'error' ? 'warn' : 'off', label: RUNTIME_LABEL[runtime.status] },
    { icon: Database, name: 'Local SQL engine', detail: 'SQLite in runtime · CSV files as tables', status: alive ? 'ok' : 'off', label: alive ? 'Available' : 'Needs runtime' },
    { icon: Database, name: 'cole_labs_warehouse', detail: 'PostgreSQL · read-only · cần connector phía backend', status: 'off', label: 'Not configured' },
    { icon: Server, name: 'Vector DB (Chroma / pgvector)', detail: 'Cho RAG · chưa có trong prototype', status: 'off', label: 'Unavailable' },
    { icon: Globe, name: 'Object storage (S3)', detail: 'Ảnh sản phẩm, file lớn · cần IAM theo workspace', status: 'off', label: 'Not connected' },
    { icon: KeyRound, name: 'LLM API (Gemini/OpenAI)', detail: 'Secret phải lưu trong vault backend, inject vào runtime', status: 'off', label: 'No secret' },
  ];
  return (
    <Pane title="Connections & APIs">
      <div className="group-h"><Cable size={11} />Connections</div>
      {rows.map((r) => (
        <div key={r.name} className="list-item" style={{ cursor: 'default' }}>
          <r.icon size={14} className={r.status === 'ok' ? 't-green' : r.status === 'warn' ? 't-red' : 'dim'} style={{ marginTop: 2 }} />
          <div className="li-main"><span className="small">{r.name}</span><span className="xs dim">{r.detail}</span></div>
          <span className={`badge ${r.status === 'ok' ? 'green' : r.status === 'warn' ? 'red' : 'outline'}`}>{r.label}</span>
        </div>
      ))}
      <div className="p-12"><div className="callout xs"><KeyRound size={14} /><div>Secrets không bao giờ được lưu trên trình duyệt hay đưa vào URL/log. Nút cấu hình bị khoá cho tới khi có secret vault phía backend.</div></div></div>
      <div className="group-h"><Globe size={11} />APIs</div>
      <div className="list-item" onClick={() => openTab({ id: 'api', kind: 'api', title: 'API Tester' })}>
        <Globe size={14} className="t-accent" />
        <div className="li-main"><span className="small">API Tester</span><span className="xs dim">Gửi request HTTP thật từ trình duyệt (chịu giới hạn CORS)</span></div>
      </div>
      <div className="list-item" style={{ cursor: 'default' }}>
        <Rocket size={14} className="dim" />
        <div className="li-main"><span className="small">Deployments</span><span className="xs dim">Cần deployment service (container + gateway). Chưa hỗ trợ.</span></div>
        <span className="badge outline">Planned</span>
      </div>
      <div className="p-12 xs dim row"><RuntimeDot status={runtime.status} /> Runtime: {RUNTIME_LABEL[runtime.status]}</div>
    </Pane>
  );
}

/* ---------------- Notes ---------------- */
export const NOTE_STATUS: Record<NoteStatus, { label: string; tone: string; icon: typeof Circle }> = {
  idea: { label: 'Ý tưởng', tone: 'outline', icon: Circle },
  doing: { label: 'Đang làm', tone: 'amber', icon: CircleDot },
  done: { label: 'Đã xong (tự đánh giá)', tone: 'green', icon: CheckCircle2 },
  blocked: { label: 'Vướng mắc', tone: 'red', icon: AlertTriangle },
};
function NotesView() {
  const notes = useWs((s) => s.notes);
  const activeNoteId = useWs((s) => s.activeNoteId);
  const [f, setF] = useState<NoteStatus | 'all'>('all');
  const { addNote, openNote } = useWs.getState();
  const list = notes.filter((n) => f === 'all' || n.status === f).sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <Pane title="Notes & Tasks" actions={<button className="btn sm primary" id="new-note" onClick={() => addNote({ body: 'Đang làm: \nĐã thực hiện: \nKết quả: \nTiếp theo: \nVấn đề gặp phải: ' })}><Plus size={12} />Note</button>}>
      <div className="p-8"><div className="seg" style={{ width: '100%' }}>
        {(['all', 'doing', 'done', 'blocked', 'idea'] as const).map((s) => <button key={s} className={f === s ? 'on' : ''} onClick={() => setF(s)} style={{ flex: 1 }}>{s === 'all' ? 'All' : NOTE_STATUS[s].label.split(' ')[0]}</button>)}
      </div></div>
      {list.length === 0 && <Empty icon={<StickyNote size={22} />} title="Không có note">Ghi chú do bạn tự quản lý, không phải checklist bắt buộc.</Empty>}
      {list.map((n) => {
        const st = NOTE_STATUS[n.status];
        return (
          <div key={n.id} className={`list-item ${activeNoteId === n.id ? 'on' : ''}`} onClick={() => openNote(n.id)}>
            <st.icon size={14} className={`t-${st.tone === 'outline' ? 'blue' : st.tone}`} style={{ marginTop: 2 }} />
            <div className="li-main">
              <span className="small ellipsis">{n.title}</span>
              <span className="xs dim ellipsis">{n.body.split('\n').find((l) => l.split(':')[1]?.trim()) ?? 'Trống'} · {relTime(n.updatedAt)}</span>
              {n.links.length > 0 && <span className="xs t-accent">{n.links.length} liên kết</span>}
            </div>
          </div>
        );
      })}
    </Pane>
  );
}
