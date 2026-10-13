import { Fragment, useEffect, useState } from 'react';
import {
  BookOpen, Boxes, CheckCircle2, ChevronRight, CircleDashed, Clock, Copy, Download, ExternalLink, FileText, GitBranch, HardDrive,
  Link2, PanelRightClose, Pencil, Plus, Search, StickyNote, Trash2, X, XCircle, Cpu,
} from 'lucide-react';
import { useWs, type RightView, isArtifactCandidate } from '../state/workspace';
import { templateById } from '../adapters/templates';
import { ArtifactTypeBadge, Empty, FileIcon, Markdown, PathChip, RuntimeDot, RUNTIME_LABEL } from '../components/ui';
import { confirmDialog, toast } from '../components/dialogs';
import { basename, copyText, downloadContent, fmtBytes, fmtDateTime, fmtDuration, fmtNum, relTime } from '../lib/format';
import { NOTE_STATUS, RunStatusIcon, runLabel } from './Sidebar';
import type { Note, NoteLink, NoteStatus } from '../lib/types';

const VIEWS: { id: RightView; label: string; icon: typeof Search }[] = [
  { id: 'inspector', label: 'Inspector', icon: Search },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'docs', label: 'Docs', icon: BookOpen },
];

export default function RightPanel() {
  const view = useWs((s) => s.layout.rightView);
  const { setLayout } = useWs.getState();
  return (
    <div className="pane">
      <div className="subtabs" style={{ paddingRight: 4 }}>
        {VIEWS.map((v) => (
          <button key={v.id} id={`rp-tab-${v.id}`} className={view === v.id ? 'on' : ''} onClick={() => setLayout({ rightView: v.id })}><v.icon size={13} />{v.label}</button>
        ))}
        <div className="grow" />
        <button className="icon-btn sm" style={{ alignSelf: 'center' }} title="Ẩn panel phải (Ctrl+Alt+B)" onClick={() => setLayout({ rightOpen: false })}><PanelRightClose size={14} /></button>
      </div>
      <div className="pane-b">
        {view === 'inspector' && <Inspector />}
        {view === 'notes' && <NotesPanel />}
        {view === 'docs' && <DocsPanel />}
      </div>
    </div>
  );
}

/* =============================== Inspector =============================== */
function Inspector() {
  const sel = useWs((s) => s.selection);
  if (!sel) return <Empty icon={<Search size={22} />} title="Chưa chọn đối tượng">Chọn một file, artifact, lần chạy hoặc experiment để xem metadata, vị trí lưu trữ và quan hệ lineage.</Empty>;
  if (sel.kind === 'file' || sel.kind === 'artifact') return <FileInspector path={sel.ref} />;
  if (sel.kind === 'run') return <RunInspector id={sel.ref} />;
  if (sel.kind === 'experiment') return <ExperimentInspector id={sel.ref} />;
  return <VarInspector name={sel.ref} />;
}

/** The four persistence layers, shown explicitly instead of one generic “Saved”. */
function PersistenceLayers({ path }: { path: string }) {
  const meta = useWs((s) => s.files[path]);
  const dirty = useWs((s) => s.buffers[path] !== undefined);
  const saving = useWs((s) => !!s.saving[path]);
  const artifact = useWs((s) => s.artifacts.find((a) => a.path === path));
  const rt = useWs((s) => s.runtime.status);
  const alive = rt === 'running' || rt === 'busy' || rt === 'restart-required';
  const Row = ({ ok, warn, icon, label, detail }: { ok: boolean; warn?: boolean; icon: React.ReactNode; label: string; detail: string }) => (
    <div className="persist-row">
      {icon}
      <div className="grow col" style={{ gap: 0 }}><span className="strong">{label}</span><span className="dim">{detail}</span></div>
      {ok ? <CheckCircle2 size={14} className="t-green" /> : warn ? <XCircle size={14} className="t-amber" /> : <CircleDashed size={14} className="dim" />}
    </div>
  );
  return (
    <div className="persist-grid" id="persistence-layers">
      <Row ok={!dirty} warn={dirty} icon={<Pencil size={13} className="t-blue" />} label="Editor buffer" detail={saving ? 'Đang ghi…' : dirty ? 'Có thay đổi chưa ghi (autosave ~1s)' : 'Khớp với bản đã lưu'} />
      <Row ok={!!meta && !meta.notSynced} warn={!!meta?.notSynced} icon={<HardDrive size={13} className="t-teal" />} label="Workspace storage" detail={meta ? (meta.notSynced ? 'CHƯA lưu: file quá lớn, chỉ có trong runtime' : `Đã lưu · ${relTime(meta.updatedAt)} · ${meta.origin}`) : 'Không có trong storage'} />
      <Row ok={!!artifact} icon={<Boxes size={13} className="t-accent" />} label="Artifact registry" detail={artifact ? `v${artifact.version} · ${artifact.registration === 'manual' ? 'đăng ký thủ công' : 'tự động từ runtime'}` : isArtifactCandidate(path) ? 'Chưa đăng ký' : 'Source file: theo dõi bằng storage, không phải artifact'} />
      <Row ok={alive && !!meta && !meta.notSynced} icon={<Cpu size={13} className="t-violet" />} label="Runtime filesystem" detail={alive ? 'Đã mount vào /workspace của session hiện tại' : `Runtime ${RUNTIME_LABEL[rt].toLowerCase()}: sẽ được nạp lại khi khởi động`} />
    </div>
  );
}

function FileInspector({ path }: { path: string }) {
  const meta = useWs((s) => s.files[path]);
  const artifact = useWs((s) => s.artifacts.find((a) => a.path === path));
  const runs = useWs((s) => s.runs);
  const artifacts = useWs((s) => s.artifacts);
  const notes = useWs((s) => s.notes);
  const ws = useWs((s) => s.ws)!;
  const { openFile, registerArtifact, select, openTab, readFile, addNote, openNote } = useWs.getState();
  const producer = artifact?.createdByRunId ? runs.find((r) => r.id === artifact.createdByRunId) : undefined;
  const consumers = artifacts.filter((a) => a.inputs.includes(path));
  const readers = runs.filter((r) => r.inputs.includes(path)).slice(-5).reverse();
  const linkedNotes = notes.filter((n) => n.links.some((l) => l.ref === path));
  const uri = artifact?.storage.uri ?? (meta ? `idb://ai-lab-platform/${ws.id}/${path}` : '—');
  const download = async () => { const c = await readFile(path); if (c !== undefined && meta) downloadContent(basename(path), c, meta.encoding); };
  return (
    <div className="fade-in">
      <div className="insp-section">
        <div className="insp-title"><FileIcon path={path} size={16} />{basename(path)}{artifact && <ArtifactTypeBadge type={artifact.type} />}</div>
        <PathChip path={path} />
        <div className="row wrap gap-4">
          {meta && <button className="btn sm" onClick={() => openFile(path)}><ExternalLink size={12} />Open</button>}
          {meta && !meta.notSynced && <button className="btn sm" onClick={() => void download()}><Download size={12} />Download</button>}
          <button className="btn sm" onClick={async () => { if (await copyText(uri)) toast('Đã sao chép storage URI', 'success'); }}><Copy size={12} />Copy URI</button>
          {meta && !artifact && <button className="btn sm" id="register-artifact" onClick={() => void registerArtifact(path).then(() => toast(`Đã đăng ký ${path} thành artifact`, 'success'))}><Boxes size={12} />Register artifact</button>}
          <button className="btn sm ghost" onClick={() => addNote({ title: `Ghi chú: ${basename(path)}`, status: 'doing', body: 'Đang làm: \nĐã thực hiện: \nKết quả: \nTiếp theo: ', links: [{ kind: artifact ? 'artifact' : 'file', ref: path, label: path }] })}><StickyNote size={12} />Note</button>
        </div>
      </div>
      <div className="insp-section">
        <span className="upper">Persistence</span>
        <PersistenceLayers path={path} />
      </div>
      <div className="insp-section">
        <span className="upper">Metadata</span>
        <dl className="kv">
          <dt>Size</dt><dd className="num">{fmtBytes(meta?.size ?? artifact?.size)}</dd>
          <dt>Encoding</dt><dd className="mono">{meta?.encoding ?? '—'}</dd>
          <dt>Origin</dt><dd>{meta?.origin ?? '—'}</dd>
          <dt>Created</dt><dd>{fmtDateTime(meta?.createdAt ?? artifact?.createdAt)}</dd>
          <dt>Updated</dt><dd>{fmtDateTime(meta?.updatedAt ?? artifact?.updatedAt)}</dd>
          <dt>Backend</dt><dd className="mono xs">{artifact?.storage.backend ?? 'browser-indexeddb'}</dd>
          <dt>URI</dt><dd className="mono xs">{uri}</dd>
          {artifact && <><dt>Source</dt><dd className="xs">{artifact.source}</dd></>}
        </dl>
      </div>
      {artifact && (
        <div className="insp-section">
          <span className="upper">Lineage</span>
          <div className="xs muted">Inputs đọc bởi run tạo ra phiên bản mới nhất (tự ghi nhận):</div>
          {artifact.inputs.length === 0 && <div className="xs dim">Không ghi nhận input trong chính lần chạy này{artifact.registration === 'manual' ? ' (đăng ký thủ công)' : ''}.</div>}
          {artifact.inputs.map((p) => (
            <button key={p} className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => select({ kind: artifacts.some((a) => a.path === p) ? 'artifact' : 'file', ref: p })}><ChevronRight size={12} /><span className="mono ellipsis">{p}</span></button>
          ))}
          {!!artifact.sessionInputs?.length && <>
            <div className="xs t-teal" title="Dữ liệu có thể đã đi qua biến trong bộ nhớ. Runtime không chứng minh được quan hệ này.">Session context (suy luận): đã được đọc ở lần chạy trước trong cùng runtime session</div>
            {artifact.sessionInputs.map((p) => (
              <button key={`s:${p}`} className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => select({ kind: artifacts.some((a) => a.path === p) ? 'artifact' : 'file', ref: p })}><span className="t-teal">…</span><span className="mono ellipsis dim">{p}</span></button>
            ))}
          </>}
          {producer && (
            <div className="row xs" style={{ cursor: 'pointer' }} onClick={() => { openTab({ id: `run:${producer.id}`, kind: 'run', title: `Run ${producer.id.slice(-4)}`, ref: producer.id }); select({ kind: 'run', ref: producer.id }); }}>
              <RunStatusIcon r={producer} size={12} /><span>Produced by</span><span className="mono t-accent ellipsis">{runLabel(producer)}</span><span className="dim">{relTime(producer.startedAt)}</span>
            </div>
          )}
          {consumers.length > 0 && <div className="xs muted">Được dùng làm input cho:</div>}
          {consumers.map((a) => (
            <button key={a.id} className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => select({ kind: 'artifact', ref: a.path })}><GitBranch size={12} /><span className="mono ellipsis">{a.path}</span></button>
          ))}
          <button className="btn sm" onClick={() => openTab({ id: 'lineage', kind: 'lineage', title: 'Lineage' })}><GitBranch size={12} />Open lineage graph</button>
        </div>
      )}
      {artifact && (
        <div className="insp-section">
          <span className="upper">Versions ({artifact.history.length})</span>
          <table className="list-table">
            <thead><tr><th>v</th><th>At</th><th>Size</th><th>Run</th></tr></thead>
            <tbody>
              {[...artifact.history].reverse().map((h) => (
                <tr key={h.version}><td className="num">v{h.version}</td><td className="xs">{fmtDateTime(h.at)}</td><td className="num xs">{fmtBytes(h.size)}</td><td className="mono xs dim">{h.runId?.slice(-6) ?? 'manual'}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="xs dim">Prototype chỉ giữ nội dung của phiên bản mới nhất; lịch sử lưu metadata. Backend có object versioning sẽ cho phép tải các bản cũ.</div>
        </div>
      )}
      {!artifact && readers.length > 0 && (
        <div className="insp-section">
          <span className="upper">Đọc bởi các lần chạy</span>
          {readers.map((r) => <div key={r.id} className="row xs"><RunStatusIcon r={r} size={12} /><span className="mono ellipsis">{runLabel(r)}</span><span className="dim">{relTime(r.startedAt)}</span></div>)}
        </div>
      )}
      {linkedNotes.length > 0 && (
        <div className="insp-section">
          <span className="upper">Notes liên kết</span>
          {linkedNotes.map((n) => <button key={n.id} className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => openNote(n.id)}><StickyNote size={12} />{n.title}</button>)}
        </div>
      )}
    </div>
  );
}

function RunInspector({ id }: { id: string }) {
  const r = useWs((s) => s.runs.find((x) => x.id === id));
  const { openTab, select, addNote } = useWs.getState();
  if (!r) return <Empty title="Run không còn trong lịch sử" />;
  return (
    <div className="fade-in">
      <div className="insp-section">
        <div className="insp-title"><RunStatusIcon r={r} size={16} />{runLabel(r)}</div>
        <div className="row wrap gap-4">
          <span className="badge outline">{r.kind}</span>
          <span className={`badge ${r.status === 'ok' ? 'green' : r.status === 'error' ? 'red' : 'outline'}`}>{r.status === 'ok' ? 'exit 0' : r.status}</span>
          {r.execCount != null && <span className="badge outline num">In [{r.execCount}]</span>}
        </div>
        <div className="row gap-4">
          <button className="btn sm" onClick={() => openTab({ id: `run:${r.id}`, kind: 'run', title: `Run ${r.id.slice(-4)}`, ref: r.id })}><ExternalLink size={12} />Execution Inspector</button>
          <button className="btn sm ghost" onClick={() => addNote({ title: `Run ${runLabel(r)}`, status: r.status === 'error' ? 'blocked' : 'doing', body: `Vấn đề gặp phải: ${r.error ? `${r.error.ename}: ${r.error.evalue}` : ''}\n`, links: [{ kind: 'run', ref: r.id, label: runLabel(r) }] })}><StickyNote size={12} />Note</button>
        </div>
      </div>
      <div className="insp-section">
        <dl className="kv">
          <dt>Run ID</dt><dd className="mono xs">{r.id}</dd>
          <dt>Session</dt><dd className="mono xs">{r.sessionId || '—'}</dd>
          <dt>Started</dt><dd>{fmtDateTime(r.startedAt)}</dd>
          <dt>Ended</dt><dd>{fmtDateTime(r.endedAt)}</dd>
          <dt>Duration</dt><dd className="num">{fmtDuration(r.durationMs)}</dd>
          <dt>Heap after</dt><dd className="num">{r.heapMB != null ? `${r.heapMB} MB` : '—'}</dd>
          <dt>Figures</dt><dd className="num">{r.figures ?? 0}</dd>
        </dl>
      </div>
      <div className="insp-section">
        <span className="upper">I/O được runtime ghi nhận</span>
        <div className="xs muted">Inputs</div>
        {r.inputs.length ? r.inputs.map((p) => <button key={p} className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => select({ kind: 'file', ref: p })}><span className="mono ellipsis">{p}</span></button>) : <div className="xs dim">—</div>}
        <div className="xs muted">Outputs (đã lưu vào storage)</div>
        {r.outputs.length ? r.outputs.map((p) => <button key={p} className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => select({ kind: 'artifact', ref: p })}><span className="mono ellipsis t-green">{p}</span></button>) : <div className="xs dim">—</div>}
        {r.result?.kind === 'dataframe' && <div className="callout violet xs"><CircleDashed size={13} /><div>Kết quả là DataFrame <b>{r.result.ref ?? ''}</b> {r.result.shape.join(' × ')} chỉ nằm trong bộ nhớ runtime: chưa phải artifact.</div></div>}
      </div>
      {r.error && (
        <div className="insp-section">
          <span className="upper t-red">Exception</span>
          <pre className="tb">{r.error.ename}: {r.error.evalue}</pre>
        </div>
      )}
    </div>
  );
}

function ExperimentInspector({ id }: { id: string }) {
  const e = useWs((s) => s.experiments.find((x) => x.id === id));
  const { select, openTab } = useWs.getState();
  if (!e) return <Empty title="Experiment không tồn tại" />;
  return (
    <div className="fade-in">
      <div className="insp-section">
        <div className="insp-title">{e.name}</div>
        <div className="row wrap gap-4"><span className="badge accent">{e.model_type}</span><span className="badge outline">{e.framework}</span></div>
        <button className="btn sm" onClick={() => openTab({ id: 'experiments', kind: 'experiments', title: 'Experiments' })}><ExternalLink size={12} />Compare experiments</button>
      </div>
      <div className="insp-section">
        <span className="upper">Metrics</span>
        <dl className="kv">{Object.entries(e.metrics).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd className="num">{fmtNum(v, 4)}</dd></Fragment>)}</dl>
      </div>
      <div className="insp-section">
        <span className="upper">Params</span>
        <dl className="kv">{Object.entries(e.params).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd className="mono xs">{String(v)}</dd></Fragment>)}</dl>
      </div>
      <div className="insp-section">
        <dl className="kv">
          <dt>Dataset</dt><dd>{e.dataset ? <a href="#" onClick={(ev) => { ev.preventDefault(); select({ kind: 'artifact', ref: e.dataset! }); }} className="mono xs">{e.dataset}</a> : '—'}</dd>
          <dt>Model</dt><dd>{e.model_path ? <a href="#" onClick={(ev) => { ev.preventDefault(); select({ kind: 'artifact', ref: e.model_path! }); }} className="mono xs">{e.model_path}</a> : '—'}</dd>
          <dt>Record</dt><dd className="mono xs">{e.file}</dd>
          <dt>Run</dt><dd className="mono xs">{e.run_id ?? '—'}</dd>
          <dt>Duration</dt><dd className="num">{e.duration_s != null ? `${e.duration_s.toFixed(2)} s` : '—'}</dd>
          <dt>Logged</dt><dd>{fmtDateTime(e.created_at * 1000)}</dd>
        </dl>
      </div>
    </div>
  );
}

function VarInspector({ name }: { name: string }) {
  const v = useWs((s) => s.runtime.vars.find((x) => x.name === name));
  if (!v) return <Empty title={`Biến ${name} không còn trong bộ nhớ`}>Runtime có thể đã dừng hoặc khởi động lại.</Empty>;
  return (
    <div className="insp-section">
      <div className="insp-title"><span className="t-violet">◆</span>{v.name}</div>
      <div className="callout violet xs"><CircleDashed size={13} /><div>Đối tượng trong bộ nhớ runtime: mất khi dừng runtime. Không phải artifact.</div></div>
      <dl className="kv"><dt>Type</dt><dd className="mono">{v.type}</dd><dt>Shape</dt><dd className="num">{v.shape?.join(' × ') ?? '—'}</dd><dt>Size</dt><dd className="num">{fmtBytes(v.bytes)}</dd></dl>
    </div>
  );
}

/* =============================== Notes =============================== */
function NotesPanel() {
  const notes = useWs((s) => s.notes);
  const activeId = useWs((s) => s.activeNoteId);
  const note = notes.find((n) => n.id === activeId) ?? notes[0];
  const { addNote, openNote } = useWs.getState();
  if (!note) {
    return (
      <Empty icon={<StickyNote size={22} />} title="Chưa có note">
        <div className="col" style={{ alignItems: 'center' }}>
          Ghi chú và công việc do bạn tự quản lý. Không phải điều kiện để chạy code.
          <button className="btn sm primary" onClick={() => addNote()}><Plus size={12} />Tạo note</button>
        </div>
      </Empty>
    );
  }
  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="row" style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>
        <select className="select grow" value={note.id} onChange={(e) => openNote(e.target.value)} aria-label="Chọn note" id="note-select">
          {notes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
        </select>
        <button className="icon-btn" title="Note mới" id="rp-new-note" onClick={() => addNote({ body: 'Đang làm: \nĐã thực hiện: \nKết quả: \nTiếp theo: \nVấn đề gặp phải: ' })}><Plus size={14} /></button>
      </div>
      <NoteEditor key={note.id} note={note} />
    </div>
  );
}

function NoteEditor({ note }: { note: Note }) {
  const { updateNote, deleteNote, select, openFile, openTab } = useWs.getState();
  const files = useWs((s) => s.files);
  const sel = useWs((s) => s.selection);
  const activePath = useWs((s) => { const g = s.layout.groups.main; return g.tabs.find((t) => t.id === g.active)?.ref; });
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  useEffect(() => { const t = window.setTimeout(() => { if (title !== note.title || body !== note.body) updateNote(note.id, { title, body }); }, 400); return () => window.clearTimeout(t); }, [title, body]); // eslint-disable-line react-hooks/exhaustive-deps
  const addLink = (link: NoteLink) => { if (!note.links.some((l) => l.ref === link.ref)) updateNote(note.id, { links: [...note.links, link] }); };
  const st = NOTE_STATUS[note.status];
  const openLink = (l: NoteLink) => {
    if (l.kind === 'run') { openTab({ id: `run:${l.ref}`, kind: 'run', title: `Run ${l.ref.slice(-4)}`, ref: l.ref }); select({ kind: 'run', ref: l.ref }); }
    else if (files[l.ref]) openFile(l.ref);
    else select({ kind: 'artifact', ref: l.ref });
  };
  const selRef = sel && (sel.kind === 'file' || sel.kind === 'artifact' || sel.kind === 'run') ? sel : null;
  const saved = title === note.title && body === note.body;
  return (
    <div className="col grow scroll p-12" style={{ gap: 10 }}>
      <input className="input" id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Tiêu đề note" style={{ fontWeight: 600 }} />
      <div className="row">
        <select className="select" id="note-status" value={note.status} onChange={(e) => updateNote(note.id, { status: e.target.value as NoteStatus })} aria-label="Trạng thái">
          {(Object.keys(NOTE_STATUS) as NoteStatus[]).map((s) => <option key={s} value={s}>{NOTE_STATUS[s].label}</option>)}
        </select>
        <span className={`badge ${st.tone}`}><st.icon size={10} />{st.label.split(' ')[0]}</span>
        <div className="grow" />
        <span className="xs dim row gap-4">{saved ? <><CheckCircle2 size={11} className="t-green" />Lưu vào storage · {relTime(note.updatedAt)}</> : <><Clock size={11} />Đang ghi…</>}</span>
      </div>
      <textarea
        className="textarea mono"
        id="note-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={12}
        placeholder={'Đang làm: …\nĐã thực hiện: …\nKết quả: …\nTiếp theo: …\nVấn đề gặp phải: …'}
        aria-label="Nội dung note"
        style={{ fontSize: 12, minHeight: 200 }}
      />
      <div className="col" style={{ gap: 4 }}>
        <div className="row"><span className="upper">Liên kết</span><div className="grow" /></div>
        {note.links.length === 0 && <div className="xs dim">Liên kết note với file, artifact hoặc lần chạy để truy xuất lại sau.</div>}
        {note.links.map((l) => (
          <div key={l.ref} className="row xs" style={{ padding: '3px 6px', background: 'var(--bg-2)', borderRadius: 4 }}>
            <Link2 size={11} className="t-accent" />
            <span className="badge outline">{l.kind}</span>
            <a href="#" className="mono ellipsis grow" onClick={(e) => { e.preventDefault(); openLink(l); }}>{l.label}</a>
            {l.kind !== 'run' && !files[l.ref] && <span className="badge red">missing</span>}
            <button className="icon-btn sm" title="Bỏ liên kết" onClick={() => updateNote(note.id, { links: note.links.filter((x) => x.ref !== l.ref) })}><X size={11} /></button>
          </div>
        ))}
        <div className="row wrap gap-4" style={{ marginTop: 4 }}>
          {activePath && files[activePath] && <button className="btn sm ghost" id="note-link-active" onClick={() => addLink({ kind: 'file', ref: activePath, label: activePath })}><FileText size={12} />Link tab đang mở</button>}
          {selRef && <button className="btn sm ghost" id="note-link-selection" onClick={() => addLink({ kind: selRef.kind, ref: selRef.ref, label: selRef.kind === 'run' ? `run ${selRef.ref.slice(-6)}` : selRef.ref } as NoteLink)}><Link2 size={12} />Link mục đang chọn ({selRef.kind})</button>}
        </div>
      </div>
      <div className="row" style={{ marginTop: 'auto' }}>
        <span className="xs dim">Trạng thái chỉ phục vụ quản lý cá nhân; không khoá chức năng nào.</span>
        <div className="grow" />
        <button className="btn sm danger" onClick={async () => { if (await confirmDialog({ title: 'Xoá note?', message: `"${note.title}" sẽ bị xoá khỏi workspace storage.`, danger: true })) deleteNote(note.id); }}><Trash2 size={12} />Xoá</button>
      </div>
    </div>
  );
}

/* =============================== Docs =============================== */
function DocsPanel() {
  const docRef = useWs((s) => s.layout.docRef);
  const ws = useWs((s) => s.ws)!;
  const files = useWs((s) => s.files);
  const { setLayout, readFile } = useWs.getState();
  const tpl = templateById(ws.templateId);
  const [content, setContent] = useState<string>();
  const fileRef = docRef?.startsWith('file:') ? docRef.slice(5) : undefined;
  const lab = docRef?.startsWith('lab:') ? tpl?.labs.find((l) => l.id === docRef.slice(4)) : undefined;
  useEffect(() => { if (fileRef) void readFile(fileRef).then(setContent); }, [fileRef, files[fileRef ?? '']?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const docs = Object.keys(files).filter((p) => p.endsWith('.md')).sort();
  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="row" style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>
        <select className="select grow" id="doc-select" value={docRef ?? ''} onChange={(e) => setLayout({ docRef: e.target.value || undefined })} aria-label="Chọn tài liệu">
          <option value="">Chọn tài liệu để đọc song song…</option>
          <optgroup label="Labs & hướng dẫn (read-only)">{tpl?.labs.map((l) => <option key={l.id} value={`lab:${l.id}`}>{l.title}</option>)}</optgroup>
          <optgroup label="Docs trong workspace">{docs.map((p) => <option key={p} value={`file:${p}`}>{p}</option>)}</optgroup>
        </select>
      </div>
      <div className="grow scroll" style={{ padding: '14px 16px' }}>
        {lab && <><div className="row xs dim" style={{ marginBottom: 8 }}><BookOpen size={12} />{lab.author} · gợi ý, không bắt buộc</div><Markdown source={lab.body} /></>}
        {fileRef && content !== undefined && <Markdown source={content} />}
        {!lab && !fileRef && <Empty icon={<BookOpen size={22} />} title="Docs ngay trong workspace">Chọn lab, hướng dẫn hoặc file .md để đọc song song với code. Ghim nhanh từ sidebar Labs &amp; Docs.</Empty>}
      </div>
      <div className="row xs dim" style={{ padding: '6px 10px', borderTop: '1px solid var(--line)' }}>
        <RuntimeDot status="stopped" /> Docs không cần runtime.
      </div>
    </div>
  );
}
