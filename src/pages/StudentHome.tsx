import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Boxes, Clock, Cpu, FolderKanban, HardDrive, Loader2, Play, Plus, StickyNote, CheckCircle2, XCircle, CircleDashed, Users,
} from 'lucide-react';
import { storage, storageEstimate } from '../adapters/storage';
import { CLASSES, PROJECTS, classById, currentUser, domainById, ensureWorkspace, projectById } from '../adapters/catalog';
import { ArtifactIcon, ArtifactTypeBadge, DemoBadge, Empty } from '../components/ui';
import { basename, fmtBytes, fmtDuration, relTime } from '../lib/format';
import type { Artifact, Note, RunRecord, WorkspaceMeta } from '../lib/types';
import { NOTE_STATUS } from '../workspace/Sidebar';

interface WsSummary { ws: WorkspaceMeta; files: number; bytes: number; runs: RunRecord[]; artifacts: Artifact[]; notes: Note[] }

export default function StudentHome() {
  const nav = useNavigate();
  const [items, setItems] = useState<WsSummary[] | null>(null);
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Tổng quan · AI Lab Platform';
    void (async () => {
      let list = await storage.listWorkspaces();
      if (!list.length) { await ensureWorkspace('p-ecom-churn'); list = await storage.listWorkspaces(); }
      const out = await Promise.all(list.map(async (ws) => {
        const [files, runs, artifacts, notes] = await Promise.all([storage.listFiles(ws.id), storage.getRuns(ws.id), storage.getArtifacts(ws.id), storage.getNotes(ws.id)]);
        return { ws, files: Object.keys(files).length, bytes: Object.values(files).reduce((s, f) => s + f.size, 0), runs, artifacts, notes };
      }));
      out.sort((a, b) => b.ws.lastOpenedAt - a.ws.lastOpenedAt);
      setItems(out);
      setEst(await storageEstimate());
    })();
  }, []);

  const open = async (projectId: string) => {
    setOpening(projectId);
    const ws = await ensureWorkspace(projectId);
    nav(`/w/${ws.id}`);
  };

  if (!items) return <div className="center fill"><div className="row muted"><Loader2 size={16} className="spin" />Đang đọc workspace từ storage…</div></div>;

  const last = items[0];
  const allRuns = items.flatMap((i) => i.runs.map((r) => ({ r, ws: i.ws }))).sort((a, b) => b.r.startedAt - a.r.startedAt);
  const allArtifacts = items.flatMap((i) => i.artifacts.map((a) => ({ a, ws: i.ws }))).sort((a, b) => b.a.updatedAt - a.a.updatedAt);
  const allNotes = items.flatMap((i) => i.notes.map((n) => ({ n, ws: i.ws }))).sort((a, b) => b.n.updatedAt - a.n.updatedAt);
  const sessions = groupSessions(allRuns);
  const lastNote = last?.notes.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const totalBytes = items.reduce((s, i) => s + i.bytes, 0);
  const myClasses = CLASSES.filter((c) => PROJECTS.some((p) => p.classId === c.id));

  return (
    <div className="page-inner">
      <div className="page-head">
        <div>
          <h1>Chào {currentUser.name.split(' ').pop()},</h1>
          <p>Tiếp tục từ nơi bạn dừng lại. Mọi file, artifact và ghi chú đều được lưu độc lập với runtime.</p>
        </div>
        <div className="grow" />
        <Link to="/projects" className="btn" id="home-browse-projects"><FolderKanban size={14} />Lớp &amp; dự án</Link>
      </div>

      {last && (
        <section className="resume" aria-label="Tiếp tục làm việc">
          <div className="col" style={{ gap: 6 }}>
            <div className="row xs muted">
              <span className="badge accent">Gần nhất</span>
              <span>{classById(last.ws.classId)?.name}</span>·<span style={{ color: domainById(last.ws.domainId)?.color }}>{domainById(last.ws.domainId)?.name}</span>·<span>mở {relTime(last.ws.lastOpenedAt)}</span>
            </div>
            <h2>{last.ws.name}</h2>
            <div className="row wrap xs muted gap-16">
              <span className="row gap-4"><HardDrive size={12} />{last.files} files · {fmtBytes(last.bytes)}</span>
              <span className="row gap-4"><Boxes size={12} />{last.artifacts.length} artifacts</span>
              <span className="row gap-4"><Clock size={12} />{last.runs.length} lần chạy{last.runs.length ? ` · gần nhất ${relTime(last.runs[last.runs.length - 1].startedAt)}` : ''}</span>
              <span className="row gap-4"><Cpu size={12} />Runtime: stopped (khởi động khi bạn chạy code)</span>
            </div>
            {lastNote && (
              <div className="callout xs" style={{ marginTop: 6, maxWidth: 720 }}>
                <StickyNote size={14} className="t-amber" />
                <div className="col" style={{ gap: 2 }}>
                  <b>{lastNote.title}</b>
                  <span className="mono" style={{ whiteSpace: 'pre-wrap' }}>{lastNote.body.split('\n').filter((l) => l.split(':')[1]?.trim()).slice(0, 3).join('\n') || 'Note trống: ghi lại bạn đang làm gì để lần sau tiếp tục nhanh hơn.'}</span>
                </div>
              </div>
            )}
          </div>
          <div className="col" style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
            <button className="btn primary" id="resume-workspace" style={{ height: 36, padding: '0 16px' }} onClick={() => nav(`/w/${last.ws.id}`)}><Play size={14} />Mở workspace</button>
            <span className="xs dim">Khôi phục tabs, layout và notes</span>
          </div>
        </section>
      )}

      <div className="grid-home">
        <div className="col gap-16">
          <section className="card">
            <div className="card-h"><h2>Workspaces của tôi</h2><span className="xs dim">1 workspace bền vững / project</span><div className="grow" /><Link to="/projects" className="btn sm ghost"><Plus size={12} />Mới</Link></div>
            <div>
              {items.map((i) => {
                const p = projectById(i.ws.projectId);
                const d = domainById(i.ws.domainId);
                const lr = i.runs[i.runs.length - 1];
                return (
                  <div key={i.ws.id} className="ws-card">
                    <div className="stripe" style={{ background: d?.color }} />
                    <div className="col" style={{ gap: 3 }}>
                      <div className="row"><Link to={`/w/${i.ws.id}`} className="strong" style={{ color: 'var(--fg-0)' }}>{i.ws.name}</Link><span className="badge outline">{d?.name}</span>{p && <span className="xs dim">{p.level}</span>}</div>
                      <div className="row xs dim wrap">
                        <span>{classById(i.ws.classId)?.name}</span>·<span>{i.files} files · {fmtBytes(i.bytes)}</span>·<span>{i.artifacts.length} artifacts</span>·<span>{i.notes.length} notes</span>
                        {lr && <>·<span className="row gap-4">{lr.status === 'ok' ? <CheckCircle2 size={11} className="t-green" /> : lr.status === 'error' ? <XCircle size={11} className="t-red" /> : <CircleDashed size={11} />}{basename(lr.source)} {relTime(lr.startedAt)}</span></>}
                      </div>
                    </div>
                    <button className="btn sm" onClick={() => nav(`/w/${i.ws.id}`)}>Open<ArrowRight size={12} /></button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="card-h"><h2>Thành phẩm mới cập nhật</h2><span className="xs dim">artifacts đã lưu bền vững</span></div>
            {allArtifacts.length === 0 ? (
              <Empty icon={<Boxes size={22} />} title="Chưa có artifact">Chạy notebook trong workspace: file do code ghi ra sẽ được lưu và đăng ký tại đây.</Empty>
            ) : (
              <table className="list-table">
                <thead><tr><th>Artifact</th><th>Type</th><th>Version</th><th>Size</th><th>Workspace</th><th>Updated</th></tr></thead>
                <tbody>
                  {allArtifacts.slice(0, 8).map(({ a, ws }) => (
                    <tr key={a.id} className="clickable" onClick={() => nav(`/w/${ws.id}`)}>
                      <td><span className="row"><ArtifactIcon type={a.type} /><span className="mono xs">{a.path}</span></span></td>
                      <td><ArtifactTypeBadge type={a.type} /></td>
                      <td className="num xs">v{a.version}</td>
                      <td className="num xs">{fmtBytes(a.size)}</td>
                      <td className="xs muted">{ws.name}</td>
                      <td className="xs">{relTime(a.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <div className="card-h"><h2>Phiên làm việc gần đây</h2><span className="xs dim">nhóm theo runtime session</span></div>
            {sessions.length === 0 ? <div className="card-b xs dim">Chưa có phiên nào.</div> : (
              <table className="list-table">
                <thead><tr><th>Session</th><th>Workspace</th><th>Runs</th><th>Lỗi</th><th>Thời lượng</th><th>Bắt đầu</th></tr></thead>
                <tbody>
                  {sessions.slice(0, 6).map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => nav(`/w/${s.ws.id}`)}>
                      <td className="mono xs">{s.id}</td>
                      <td className="xs">{s.ws.name}</td>
                      <td className="num xs">{s.count}</td>
                      <td className="num xs">{s.errors ? <span className="t-red">{s.errors}</span> : 0}</td>
                      <td className="num xs">{fmtDuration(s.end - s.start)}</td>
                      <td className="xs">{relTime(s.start)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div className="col gap-16">
          <section className="card">
            <div className="card-h"><h3>Tài nguyên &amp; lưu trữ</h3></div>
            <div className="card-b col gap-12">
              <div className="col" style={{ gap: 4 }}>
                <div className="row xs"><HardDrive size={12} className="t-teal" /><span>Workspace storage</span><div className="grow" /><span className="num">{fmtBytes(totalBytes)}</span></div>
                {est && <><div className="meter"><div style={{ width: `${Math.min(100, (est.usage / Math.max(1, est.quota)) * 100)}%` }} /></div>
                  <div className="xs dim">Trình duyệt dùng {fmtBytes(est.usage)} / quota {fmtBytes(est.quota)} (IndexedDB, đo thật)</div></>}
              </div>
              <div className="row xs"><Cpu size={12} className="t-violet" /><span>Runtime đang hoạt động</span><div className="grow" /><span className="badge outline">0 / 1</span></div>
              <div className="xs dim">Runtime chỉ chạy khi một workspace đang mở. Đóng tab = dừng runtime, dữ liệu đã lưu không bị ảnh hưởng.</div>
              <div className="row xs"><span>Giới hạn runtime (profile)</span><div className="grow" /><span className="num">2 GB RAM · CPU (WASM)</span><DemoBadge label="Quota demo" /></div>
            </div>
          </section>

          <section className="card">
            <div className="card-h"><h3>Lớp học</h3><DemoBadge /></div>
            <div>
              {myClasses.map((c) => (
                <div key={c.id} className="list-item" onClick={() => nav(`/projects?class=${c.id}`)}>
                  <Users size={14} className="t-accent" style={{ marginTop: 2 }} />
                  <div className="li-main"><span className="small strong">{c.name}</span><span className="xs dim">{c.teacher} · {c.schedule} · {PROJECTS.filter((p) => p.classId === c.id).length} dự án</span></div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-h"><h3>Ghi chú gần đây</h3></div>
            {allNotes.length === 0 ? <div className="card-b xs dim">Chưa có ghi chú.</div> : allNotes.slice(0, 5).map(({ n, ws }) => {
              const st = NOTE_STATUS[n.status];
              return (
                <div key={n.id} className="list-item" onClick={() => nav(`/w/${ws.id}`)}>
                  <st.icon size={13} className={`t-${st.tone === 'outline' ? 'blue' : st.tone}`} style={{ marginTop: 2 }} />
                  <div className="li-main"><span className="small">{n.title}</span><span className="xs dim ellipsis">{ws.name} · {relTime(n.updatedAt)}</span></div>
                </div>
              );
            })}
          </section>

          <section className="card">
            <div className="card-h"><h3>Bắt đầu nhanh</h3></div>
            <div>
              {PROJECTS.filter((p) => !items.some((i) => i.ws.projectId === p.id)).slice(0, 3).map((p) => (
                <div key={p.id} className="list-item" onClick={() => void open(p.id)}>
                  <FolderKanban size={14} style={{ marginTop: 2, color: domainById(p.domainId)?.color }} />
                  <div className="li-main"><span className="small">{p.name}</span><span className="xs dim">{domainById(p.domainId)?.name} · {p.level}</span></div>
                  {opening === p.id ? <Loader2 size={14} className="spin" /> : <Plus size={14} className="dim" />}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function groupSessions(runs: { r: RunRecord; ws: WorkspaceMeta }[]) {
  const m = new Map<string, { id: string; ws: WorkspaceMeta; count: number; errors: number; start: number; end: number }>();
  for (const { r, ws } of runs) {
    if (!r.sessionId) continue;
    const s = m.get(r.sessionId) ?? { id: r.sessionId, ws, count: 0, errors: 0, start: r.startedAt, end: r.endedAt ?? r.startedAt };
    s.count++; if (r.status === 'error') s.errors++;
    s.start = Math.min(s.start, r.startedAt); s.end = Math.max(s.end, r.endedAt ?? r.startedAt);
    m.set(r.sessionId, s);
  }
  return [...m.values()].sort((a, b) => b.start - a.start);
}
