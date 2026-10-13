import { useEffect, useMemo, useState } from 'react';
import {
  Boxes, CheckCircle2, ClipboardCheck, Clock, Eye, FileCode2, GraduationCap, Lock, MessageSquare, Save, Users, XCircle, BrainCircuit,
} from 'lucide-react';
import { storage } from '../adapters/storage';
import { CLASSES, currentUser, projectById } from '../adapters/catalog';
import { ArtifactIcon, ArtifactTypeBadge, DemoBadge, Empty, FileIcon, Markdown } from '../components/ui';
import { toast } from '../components/dialogs';
import { basename, fmtBytes, fmtDateTime, fmtDuration, fmtNum, relTime } from '../lib/format';
import type { Artifact, Experiment, FileMeta, RunRecord, WorkspaceMeta } from '../lib/types';

/* DEMO: no roster/sharing backend yet. These students are illustrative only. */
interface DemoStudent { id: string; name: string; project: string; lastActive: number; runs: number; errors: number; artifacts: number; models: number; activity: number[]; shared: boolean; best?: string }
const H = 3600_000;
const now = Date.now();
const DEMO_STUDENTS: DemoStudent[] = [
  { id: 's1', name: 'Phạm Thu Hà', project: 'Customer churn & segmentation', lastActive: now - 0.4 * H, runs: 86, errors: 9, artifacts: 11, models: 3, activity: [1, 2, 3, 3, 2, 3, 3], shared: true, best: 'roc_auc 0.84' },
  { id: 's2', name: 'Đỗ Quang Huy', project: 'Transaction fraud detection', lastActive: now - 5 * H, runs: 41, errors: 14, artifacts: 5, models: 1, activity: [0, 1, 1, 2, 0, 2, 1], shared: true, best: 'pr_auc 0.41' },
  { id: 's3', name: 'Nguyễn Khánh Linh', project: 'Customer churn & segmentation', lastActive: now - 26 * H, runs: 19, errors: 2, artifacts: 3, models: 0, activity: [2, 1, 0, 0, 1, 0, 0], shared: false },
  { id: 's4', name: 'Trần Minh Tú', project: 'CSKH chatbot (RAG)', lastActive: now - 3 * 24 * H, runs: 7, errors: 5, artifacts: 0, models: 0, activity: [1, 0, 0, 0, 0, 0, 0], shared: true },
  { id: 's5', name: 'Lý Gia Hân', project: 'Customer churn & segmentation', lastActive: now - 2 * H, runs: 63, errors: 6, artifacts: 9, models: 2, activity: [2, 3, 2, 3, 3, 2, 3], shared: false, best: 'roc_auc 0.82' },
];

interface Review { score: string; comment: string; updatedAt: number }
interface LocalSnapshot { ws: WorkspaceMeta; files: Record<string, FileMeta>; runs: RunRecord[]; artifacts: Artifact[]; experiments: Experiment[] }

export default function TeacherConsole() {
  const [section, setSection] = useState<'class' | 'review'>('class');
  const [classId, setClassId] = useState(CLASSES[0].id);
  const [local, setLocal] = useState<LocalSnapshot[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    document.title = 'Giáo viên · AI Lab Platform';
    void (async () => {
      const list = await storage.listWorkspaces();
      const snaps = await Promise.all(list.map(async (ws) => {
        const [files, runs, artifacts] = await Promise.all([storage.listFiles(ws.id), storage.getRuns(ws.id), storage.getArtifacts(ws.id)]);
        const experiments: Experiment[] = [];
        for (const p of Object.keys(files).filter((x) => x.startsWith('experiments/') && x.endsWith('.json'))) {
          try { const j = JSON.parse((await storage.readFile(ws.id, p)) ?? ''); if (j?.metrics) experiments.push({ ...j, params: j.params ?? {}, file: p }); } catch { /* skip */ }
        }
        return { ws, files, runs, artifacts, experiments };
      }));
      setLocal(snaps);
      if (snaps[0]) setSelected(`local:${snaps[0].ws.id}`);
    })();
  }, []);

  const cls = CLASSES.find((c) => c.id === classId)!;
  const rows = useMemo(() => {
    const mine = local.filter((l) => l.ws.classId === classId).map((l) => ({
      id: `local:${l.ws.id}`, name: `${currentUser.name} (bạn · local)`, project: l.ws.name, lastActive: l.ws.lastOpenedAt,
      runs: l.runs.length, errors: l.runs.filter((r) => r.status === 'error').length, artifacts: l.artifacts.length,
      models: l.artifacts.filter((a) => a.type === 'model').length, activity: activityFrom(l.runs), shared: true, real: true,
      best: bestMetric(l.experiments),
    }));
    return [...mine, ...DEMO_STUDENTS.map((s) => ({ ...s, real: false }))];
  }, [local, classId]);
  const sel = rows.find((r) => r.id === selected);

  return (
    <div className="console">
      <nav className="console-nav" aria-label="Teacher">
        <div className="upper" style={{ padding: '4px 10px 8px' }}>Giáo viên</div>
        <button className={section === 'class' ? 'on' : ''} onClick={() => setSection('class')} id="teacher-nav-class"><Users size={14} />Lớp &amp; học viên</button>
        <button className={section === 'review' ? 'on' : ''} onClick={() => setSection('review')} id="teacher-nav-review"><ClipboardCheck size={14} />Xem &amp; nhận xét</button>
        <div className="upper" style={{ padding: '14px 10px 6px' }}>Lớp</div>
        {CLASSES.map((c) => <button key={c.id} className={classId === c.id ? 'on' : ''} onClick={() => setClassId(c.id)}><GraduationCap size={14} /><span className="ellipsis">{c.name}</span></button>)}
        <div className="grow" />
        <div className="callout xs" style={{ margin: 6 }}><Lock size={13} /><div>Giáo viên chỉ xem workspace học viên đã chia sẻ hoặc được phân quyền. Quyền phải được kiểm tra ở backend.</div></div>
      </nav>
      <div className="console-main">
        <div className="page-inner">
          <div className="page-head">
            <div><h1>{cls.name}</h1><p>{cls.teacher} · {cls.schedule} · {cls.students} học viên</p></div>
            <div className="grow" /><DemoBadge label="Roster demo + 1 workspace thật" />
          </div>

          {section === 'class' && (
            <>
              <div className="grid-4">
                <Tile k="Học viên hoạt động 24h" v={`${rows.filter((r) => now - r.lastActive < 24 * H).length}/${rows.length}`} />
                <Tile k="Lần chạy (tổng)" v={rows.reduce((s, r) => s + r.runs, 0)} />
                <Tile k="Artifacts đã lưu" v={rows.reduce((s, r) => s + r.artifacts, 0)} />
                <Tile k="Model đã đăng ký" v={rows.reduce((s, r) => s + r.models, 0)} />
              </div>
              <section className="card">
                <div className="card-h"><h2>Tiến độ thực hành</h2><span className="xs dim">Đo theo hoạt động thực tế (runs, artifacts), không theo checklist bắt buộc</span></div>
                <table className="list-table" id="teacher-students">
                  <thead><tr><th>Học viên</th><th>Project</th><th>Hoạt động 7 ngày</th><th>Runs</th><th>Lỗi</th><th>Artifacts</th><th>Models</th><th>Best metric</th><th>Hoạt động</th><th>Chia sẻ</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={`clickable ${selected === r.id ? 'selected' : ''}`} onClick={() => { setSelected(r.id); setSection('review'); }}>
                        <td className="small strong">{r.name} {!r.real && <span className="badge demo">demo</span>}</td>
                        <td className="xs muted">{r.project}</td>
                        <td><div className="progress-cells">{r.activity.map((a, i) => <span key={i} className={a ? `l${a}` : ''} />)}</div></td>
                        <td className="num xs">{r.runs}</td>
                        <td className="num xs">{r.errors ? <span className="t-red">{r.errors}</span> : 0}</td>
                        <td className="num xs">{r.artifacts}</td>
                        <td className="num xs">{r.models}</td>
                        <td className="mono xs">{r.best ?? '—'}</td>
                        <td className="xs">{relTime(r.lastActive)}</td>
                        <td>{r.shared ? <span className="badge green"><Eye size={10} />shared</span> : <span className="badge outline"><Lock size={10} />private</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {section === 'review' && (
            <div className="split-review">
              <div className="col gap-12">
                <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Học viên" id="review-student">
                  {rows.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.project}</option>)}
                </select>
                {!sel && <Empty title="Chọn học viên" />}
                {sel && !sel.shared && <div className="card"><div className="lock"><Lock size={26} /><b>Workspace chưa được chia sẻ</b><span className="xs">Học viên chưa cấp quyền xem. Bạn chỉ thấy số liệu hoạt động tổng hợp ở bảng tiến độ.</span></div></div>}
                {sel && sel.shared && sel.real && <LocalReview snap={local.find((l) => `local:${l.ws.id}` === sel.id)!} />}
                {sel && sel.shared && !sel.real && (
                  <div className="card"><div className="card-b col">
                    <div className="row"><DemoBadge /><span className="xs muted">Học viên demo: không có workspace thật để mở. Khi có backend, đây sẽ là bản xem read-only của code, artifacts, runs.</span></div>
                    <dl className="kv"><dt>Project</dt><dd>{sel.project}</dd><dt>Runs</dt><dd className="num">{sel.runs} ({sel.errors} lỗi)</dd><dt>Artifacts</dt><dd className="num">{sel.artifacts}</dd><dt>Best metric</dt><dd className="mono">{sel.best ?? '—'}</dd></dl>
                  </div></div>
                )}
              </div>
              {sel && <ReviewForm key={sel.id} studentId={sel.id} disabled={!sel.shared} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ k, v }: { k: string; v: string | number }) {
  return <div className="metric-tile"><span className="v">{v}</span><span className="k">{k}</span></div>;
}

function activityFrom(runs: RunRecord[]) {
  const days = Array(7).fill(0) as number[];
  for (const r of runs) { const d = Math.floor((now - r.startedAt) / (24 * H)); if (d >= 0 && d < 7) days[6 - d]++; }
  return days.map((c) => (c === 0 ? 0 : c < 5 ? 1 : c < 15 ? 2 : 3));
}
function bestMetric(exps: Experiment[]) {
  let best: { k: string; v: number } | undefined;
  for (const e of exps) { const k = 'roc_auc' in e.metrics ? 'roc_auc' : Object.keys(e.metrics)[0]; if (k && (!best || e.metrics[k] > best.v)) best = { k, v: e.metrics[k] }; }
  return best ? `${best.k} ${fmtNum(best.v)}` : undefined;
}

function LocalReview({ snap }: { snap: LocalSnapshot }) {
  const [tab, setTab] = useState<'artifacts' | 'runs' | 'models' | 'code'>('artifacts');
  const [file, setFile] = useState<string>();
  const [content, setContent] = useState<string>();
  useEffect(() => { if (file) void storage.readFile(snap.ws.id, file).then(setContent); }, [file, snap.ws.id]);
  const code = Object.values(snap.files).filter((f) => /\.(py|sql|md|ipynb)$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  const proj = projectById(snap.ws.projectId);
  return (
    <section className="card">
      <div className="card-h"><h2>{snap.ws.name}</h2><span className="badge green">dữ liệu thật · read-only</span><div className="grow" /><span className="xs dim">{proj?.level}</span></div>
      <div className="subtabs">
        {(['artifacts', 'runs', 'models', 'code'] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'artifacts' ? <Boxes size={13} /> : t === 'runs' ? <Clock size={13} /> : t === 'models' ? <BrainCircuit size={13} /> : <FileCode2 size={13} />}{t}</button>)}
      </div>
      <div style={{ maxHeight: 560, overflow: 'auto' }}>
        {tab === 'artifacts' && (snap.artifacts.length === 0 ? <div className="p-12 xs dim">Chưa có artifact.</div> : (
          <table className="list-table"><thead><tr><th>Artifact</th><th>Type</th><th>v</th><th>Size</th><th>Inputs</th><th>Updated</th></tr></thead>
            <tbody>{snap.artifacts.map((a) => <tr key={a.id}><td><span className="row"><ArtifactIcon type={a.type} /><span className="mono xs">{a.path}</span></span></td><td><ArtifactTypeBadge type={a.type} /></td><td className="num xs">v{a.version}</td><td className="num xs">{fmtBytes(a.size)}</td><td className="mono xs dim">{a.inputs.map(basename).join(', ') || '—'}</td><td className="xs">{relTime(a.updatedAt)}</td></tr>)}</tbody></table>
        ))}
        {tab === 'runs' && (snap.runs.length === 0 ? <div className="p-12 xs dim">Chưa có lần chạy.</div> : (
          <table className="list-table"><thead><tr><th /><th>Source</th><th>Started</th><th>Duration</th><th>Error</th></tr></thead>
            <tbody>{[...snap.runs].reverse().slice(0, 100).map((r) => <tr key={r.id}><td>{r.status === 'ok' ? <CheckCircle2 size={13} className="t-green" /> : <XCircle size={13} className={r.status === 'error' ? 't-red' : 'dim'} />}</td><td className="mono xs">{basename(r.source)}{r.cellIndex != null ? ` · cell ${r.cellIndex + 1}` : ''}</td><td className="xs">{fmtDateTime(r.startedAt)}</td><td className="num xs">{fmtDuration(r.durationMs)}</td><td className="xs t-red">{r.error ? `${r.error.ename}: ${r.error.evalue.slice(0, 50)}` : ''}</td></tr>)}</tbody></table>
        ))}
        {tab === 'models' && (snap.experiments.length === 0 ? <div className="p-12 xs dim">Chưa có experiment.</div> : (
          <table className="list-table"><thead><tr><th>Experiment</th><th>Model</th><th>Metrics</th><th>Dataset</th></tr></thead>
            <tbody>{snap.experiments.map((e) => <tr key={e.id}><td className="small">{e.name}</td><td className="xs">{e.model_type}</td><td className="mono xs">{Object.entries(e.metrics).map(([k, v]) => `${k}=${fmtNum(v)}`).join('  ')}</td><td className="mono xs dim">{e.dataset}</td></tr>)}</tbody></table>
        ))}
        {tab === 'code' && (
          <div className="grid-2" style={{ gridTemplateColumns: '220px 1fr', gap: 0 }}>
            <div style={{ borderRight: '1px solid var(--line)' }}>
              {code.map((f) => <div key={f.path} className={`list-item ${file === f.path ? 'on' : ''}`} onClick={() => setFile(f.path)}><FileIcon path={f.path} /><span className="mono xs ellipsis">{f.path}</span></div>)}
            </div>
            <div className="p-12" style={{ minWidth: 0 }}>
              {!file && <div className="xs dim">Chọn file để xem (read-only).</div>}
              {file && content !== undefined && (file.endsWith('.md') ? <Markdown source={content} /> : <pre className="stream" style={{ fontSize: 11 }}>{file.endsWith('.ipynb') ? notebookToText(content) : content}</pre>)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function notebookToText(json: string) {
  try {
    const nb = JSON.parse(json) as { cells: { cell_type: string; source: string | string[] }[] };
    return nb.cells.map((c, i) => `# ── [${i + 1}] ${c.cell_type} ──\n${Array.isArray(c.source) ? c.source.join('') : c.source}`).join('\n\n');
  } catch { return json; }
}

function ReviewForm({ studentId, disabled }: { studentId: string; disabled: boolean }) {
  const [rv, setRv] = useState<Review>({ score: '', comment: '', updatedAt: 0 });
  useEffect(() => { void storage.getKV<Review>(`review:${studentId}`).then((r) => r && setRv(r)); }, [studentId]);
  const save = async () => { const next = { ...rv, updatedAt: Date.now() }; await storage.setKV(`review:${studentId}`, next); setRv(next); toast('Đã lưu nhận xét', 'success'); };
  return (
    <section className="card">
      <div className="card-h"><MessageSquare size={14} className="t-accent" /><h3>Nhận xét &amp; chấm điểm</h3><span className="xs dim">tuỳ chọn</span></div>
      <div className="card-b col">
        <label className="field">Điểm (tuỳ chọn)<input className="input" id="review-score" value={rv.score} disabled={disabled} onChange={(e) => setRv({ ...rv, score: e.target.value })} placeholder="vd. 8.5 / 10" /></label>
        <label className="field">Nhận xét<textarea className="textarea" id="review-comment" rows={8} value={rv.comment} disabled={disabled} onChange={(e) => setRv({ ...rv, comment: e.target.value })} placeholder="Nhận xét về cách xử lý dữ liệu, lựa chọn model, cách lưu artifact…" /></label>
        <div className="row"><span className="xs dim">{rv.updatedAt ? `Lưu lần cuối ${relTime(rv.updatedAt)}` : 'Chưa có nhận xét'} · lưu cục bộ (prototype)</span><div className="grow" /><button className="btn primary sm" id="review-save" disabled={disabled} onClick={() => void save()}><Save size={12} />Lưu</button></div>
        <div className="xs dim">Việc chấm điểm không khoá hay điều khiển workspace của học viên.</div>
      </div>
    </section>
  );
}
