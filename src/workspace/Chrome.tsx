import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, BookOpen, BrainCircuit, Boxes, Cable, ChevronRight, CircleStop, Cloud, Database, Files, GitBranch,
  HardDrive, NotebookTabs, PanelBottom, PanelLeft, PanelRight, Play, RotateCcw, Search, StickyNote, TerminalSquare,
} from 'lucide-react';
import { useWs, type SidebarView } from '../state/workspace';
import { classById, currentUser, domainById, projectById } from '../adapters/catalog';
import { storage, storageEstimate } from '../adapters/storage';
import { RUNTIME_LABEL, RuntimeDot } from '../components/ui';
import { fmtBytes, fmtTime } from '../lib/format';
import { buildLineage } from './lineage';

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

export function RuntimeMenu({ onClose }: { onClose: () => void }) {
  const status = useWs((s) => s.runtime.status);
  const { startRuntime, stopRuntime, restartRuntime, setLayout } = useWs.getState();
  const alive = status === 'running' || status === 'busy' || status === 'restart-required';
  return (
    <div className="menu" style={{ top: 34, right: 0 }}>
      <button id="rt-start" disabled={alive || status === 'starting'} onClick={() => { onClose(); void startRuntime(); }}><Play size={14} />Start runtime</button>
      <button id="rt-restart" disabled={!alive} onClick={() => { onClose(); void restartRuntime(); }}><RotateCcw size={14} />Restart (clear memory)</button>
      <button id="rt-stop" disabled={!alive && status !== 'starting'} onClick={() => { onClose(); stopRuntime(); }}><CircleStop size={14} />Stop runtime</button>
      <hr />
      <button onClick={() => { onClose(); setLayout({ bottomOpen: true, bottomView: 'runtime' }); }}><Activity size={14} />Runtime details</button>
      <div className="xs dim" style={{ padding: '6px 10px', maxWidth: 260 }}>Dừng runtime chỉ xoá bộ nhớ tạm (biến, DataFrame). File, artifact, notes và lịch sử chạy vẫn được giữ trong storage.</div>
    </div>
  );
}

export function TopBar({ onSearch }: { onSearch: () => void }) {
  const ws = useWs((s) => s.ws)!;
  const runtime = useWs((s) => s.runtime);
  const buffers = useWs((s) => s.buffers);
  const saving = useWs((s) => s.saving);
  const lastPersistAt = useWs((s) => s.lastPersistAt);
  const persistError = useWs((s) => s.persistError);
  const files = useWs((s) => s.files);
  const layout = useWs((s) => s.layout);
  const setLayout = useWs((s) => s.setLayout);
  const [menu, setMenu] = useState(false);
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useOutside(menuRef, () => setMenu(false));
  useEffect(() => {
    const tick = () => void storageEstimate().then(setEst);
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []);
  const project = projectById(ws.projectId);
  const cls = classById(ws.classId);
  const domain = domainById(ws.domainId);
  const dirty = Object.keys(buffers).length;
  const isSaving = Object.values(saving).some(Boolean);
  const wsBytes = useMemo(() => Object.values(files).reduce((a, f) => a + f.size, 0), [files]);
  const quotaMB = 500 * 1024 * 1024;

  return (
    <header className="topbar">
      <Link to="/" className="brand" title="AI Lab · Tổng quan"><div className="brand-logo">AI</div></Link>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/projects" className="crumb">{cls?.name ?? 'Class'}</Link>
        <ChevronRight size={12} />
        <span className="crumb">{domain?.name}</span>
        <ChevronRight size={12} />
        <span className="crumb cur" title={`Workspace ${ws.id}`}>{project?.name ?? ws.name}</span>
      </nav>
      <div className="grow" />
      <button className="search-btn" id="open-palette" onClick={onSearch}><Search size={14} />Tìm file, artifact, notes, lệnh…<span className="grow" /><kbd>Ctrl K</kbd></button>
      <div className="grow" />
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button className="pill" id="runtime-pill" onClick={() => setMenu((m) => !m)} title={runtime.message ?? ''}>
          <RuntimeDot status={runtime.status} />
          <span className="lbl">Runtime</span>
          <span>{RUNTIME_LABEL[runtime.status]}</span>
          {runtime.info.sessionId && runtime.status !== 'stopped' && <span className="mono dim">{runtime.info.sessionId}</span>}
        </button>
        {menu && <RuntimeMenu onClose={() => setMenu(false)} />}
      </div>
      <button
        className="pill"
        id="persist-pill"
        onClick={() => void useWs.getState().saveAll()}
        title={`Editor buffers: ${dirty} unsaved\nWorkspace storage: ${storage.backend}\nLast persisted: ${fmtTime(lastPersistAt)}\nClick to save all now.`}
      >
        <HardDrive size={13} className={persistError ? 't-red' : dirty || isSaving ? 't-amber' : 't-teal'} />
        {persistError ? <span className="t-red">Persist failed</span>
          : isSaving ? <span>Saving…</span>
          : dirty ? <span>{dirty} unsaved buffer{dirty > 1 ? 's' : ''}</span>
          : <span>Files persisted{lastPersistAt ? ` · ${fmtTime(lastPersistAt)}` : ''}</span>}
      </button>
      <span className="pill" title={`Workspace files: ${fmtBytes(wsBytes)} / prototype quota 500 MB\nBrowser storage (all sites data for this origin): ${est ? `${fmtBytes(est.usage)} of ${fmtBytes(est.quota)}` : 'unknown'}`}>
        <Cloud size={13} className="t-blue" />
        <span className="num">{fmtBytes(wsBytes)}</span>
        <div className="meter" style={{ width: 46 }}><div style={{ width: `${Math.min(100, (wsBytes / quotaMB) * 100)}%` }} /></div>
      </span>
      <div className="row gap-4">
        <button className={`icon-btn ${layout.sidebarOpen ? 'active' : ''}`} title="Toggle sidebar (Ctrl+B)" onClick={() => setLayout({ sidebarOpen: !layout.sidebarOpen })}><PanelLeft size={16} /></button>
        <button className={`icon-btn ${layout.bottomOpen ? 'active' : ''}`} title="Toggle bottom panel (Ctrl+J)" onClick={() => setLayout({ bottomOpen: !layout.bottomOpen })}><PanelBottom size={16} /></button>
        <button className={`icon-btn ${layout.rightOpen ? 'active' : ''}`} title="Toggle inspector (Ctrl+Alt+B)" onClick={() => setLayout({ rightOpen: !layout.rightOpen })}><PanelRight size={16} /></button>
      </div>
      <div className="avatar" title={currentUser.name}>{currentUser.initials}</div>
    </header>
  );
}

const GROUPS: { label: string; items: { id: SidebarView; icon: typeof Files; title: string }[] }[] = [
  { label: 'Build', items: [
    { id: 'explorer', icon: Files, title: 'Explorer: files & folders' },
    { id: 'labs', icon: BookOpen, title: 'Labs & Docs' },
    { id: 'data', icon: Database, title: 'Data: datasets, sources, in-memory frames' },
  ] },
  { label: 'Observe', items: [
    { id: 'runs', icon: TerminalSquare, title: 'Runs: execution history' },
    { id: 'artifacts', icon: Boxes, title: 'Artifacts' },
    { id: 'lineage', icon: GitBranch, title: 'Lineage & pipeline' },
    { id: 'models', icon: BrainCircuit, title: 'Models & Experiments' },
  ] },
  { label: 'Context', items: [
    { id: 'connections', icon: Cable, title: 'Connections & APIs' },
    { id: 'notes', icon: StickyNote, title: 'Notes & tasks' },
  ] },
];

export function ActivityBar() {
  const layout = useWs((s) => s.layout);
  const setLayout = useWs((s) => s.setLayout);
  const artifacts = useWs((s) => s.artifacts);
  const runs = useWs((s) => s.runs);
  const notes = useWs((s) => s.notes);
  const experiments = useWs((s) => s.experiments);
  const runningCount = runs.filter((r) => r.status === 'running').length;
  const counts: Partial<Record<SidebarView, { n: number; red?: boolean }>> = {
    artifacts: { n: artifacts.length },
    runs: runningCount ? { n: runningCount } : { n: 0 },
    notes: { n: notes.filter((x) => x.status === 'doing').length },
    models: { n: experiments.length },
  };
  return (
    <nav className="activitybar" aria-label="Workspace views">
      {GROUPS.map((g, gi) => (
        <div key={g.label} className="col" style={{ alignItems: 'center', gap: 2 }}>
          {gi > 0 && <div className="grp-sep" />}
          <span className="act-label">{g.label}</span>
          {g.items.map((it) => {
            const on = layout.sidebarOpen && layout.sidebarView === it.id;
            const c = counts[it.id];
            return (
              <button
                key={it.id}
                id={`act-${it.id}`}
                className={`act-btn ${on ? 'on' : ''}`}
                title={it.title}
                aria-pressed={on}
                onClick={() => setLayout(on ? { sidebarOpen: false } : { sidebarOpen: true, sidebarView: it.id })}
              >
                <it.icon size={19} strokeWidth={1.7} />
                {c && c.n > 0 && <span className={`count ${c.red ? 'red' : ''}`}>{c.n > 99 ? '99+' : c.n}</span>}
              </button>
            );
          })}
        </div>
      ))}
      <div className="grow" />
      <button className="act-btn" title="Open README" onClick={() => useWs.getState().openFile('README.md')}><NotebookTabs size={18} strokeWidth={1.7} /></button>
    </nav>
  );
}

export function StatusBar() {
  const runtime = useWs((s) => s.runtime);
  const buffers = useWs((s) => s.buffers);
  const lastPersistAt = useWs((s) => s.lastPersistAt);
  const artifacts = useWs((s) => s.artifacts);
  const files = useWs((s) => s.files);
  const runs = useWs((s) => s.runs);
  const edges = useWs((s) => s.edges);
  const setLayout = useWs((s) => s.setLayout);
  const dirty = Object.keys(buffers).length;
  const frames = runtime.vars.filter((v) => v.tabular);
  const notSynced = Object.values(files).filter((f) => f.notSynced).length;
  const stale = useMemo(() => buildLineage(artifacts, files, runs, edges).nodes.filter((n) => n.stale).length, [artifacts, files, runs, edges]);
  const lastRun = runs[runs.length - 1];
  return (
    <footer className="statusbar">
      <span className={`sb-item click sb-runtime ${runtime.status}`} onClick={() => setLayout({ bottomOpen: true, bottomView: 'runtime' })} title={runtime.message}>
        <RuntimeDot status={runtime.status} />
        {RUNTIME_LABEL[runtime.status]}
        {runtime.status === 'starting' && runtime.message && <span className="dim">· {runtime.message}</span>}
        {runtime.info.heapMB != null && runtime.status !== 'stopped' && <span className="num">· heap {runtime.info.heapMB} MB</span>}
      </span>
      <span className="sb-item" title="Editor buffers not yet written to workspace storage">
        <span className={`dot ${dirty ? 'amber' : 'green'}`} style={{ width: 6, height: 6, boxShadow: 'none' }} />
        Buffers: {dirty ? `${dirty} unsaved` : 'clean'}
      </span>
      <span className="sb-item" title={`Workspace storage backend: ${storage.backend}`}>
        <HardDrive size={12} /> Files: {Object.keys(files).length} persisted{lastPersistAt ? ` · ${fmtTime(lastPersistAt)}` : ''}
        {notSynced > 0 && <span className="t-red">· {notSynced} NOT synced</span>}
      </span>
      <span className="sb-item click" onClick={() => setLayout({ sidebarOpen: true, sidebarView: 'artifacts' })}><Boxes size={12} /> Artifacts: {artifacts.length}</span>
      <span className="sb-item click" onClick={() => setLayout({ sidebarOpen: true, sidebarView: 'data' })} title="DataFrames that exist only in runtime memory">
        <span className="t-violet">◆</span> In-memory frames: {frames.length} <span className="dim">(not persisted)</span>
      </span>
      {stale > 0 && <span className="sb-item click t-amber" onClick={() => setLayout({ sidebarOpen: true, sidebarView: 'lineage' })}><GitBranch size={12} /> {stale} stale artifact{stale > 1 ? 's' : ''}</span>}
      <span className="sb-item right click" onClick={() => setLayout({ bottomOpen: true, bottomView: 'runs' })}>
        {lastRun ? <>Last run: <span className={lastRun.status === 'ok' ? 't-green' : lastRun.status === 'error' ? 't-red' : 't-amber'}>{lastRun.status}</span> · {fmtTime(lastRun.startedAt)}</> : 'No runs yet'}
      </span>
      <span className="sb-item">Python · Pyodide</span>
    </footer>
  );
}
