import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Boxes, BrainCircuit, Command, Globe, GitBranch, Home, PanelBottom, PanelLeft, PanelRight, Play, Plus, Power, RotateCcw, Save, StickyNote,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWs } from '../state/workspace';
import { ArtifactIcon, FileIcon } from '../components/ui';
import { promptDialog, toast } from '../components/dialogs';
import { basename, fmtBytes } from '../lib/format';

interface Item { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void }

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const files = useWs((s) => s.files);
  const artifacts = useWs((s) => s.artifacts);
  const notes = useWs((s) => s.notes);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const s = useWs.getState();
    const cmds: Item[] = [
      { id: 'c:new', group: 'Commands', label: 'New file…', icon: <Plus size={14} />, run: async () => { const p = await promptDialog({ title: 'New file', label: 'Path (relative)', defaultValue: 'src/new_module.py' }); if (p) s.createFile(p).catch((e) => toast((e as Error).message, 'error')); } },
      { id: 'c:save', group: 'Commands', label: 'Save all buffers', hint: 'Ctrl+S', icon: <Save size={14} />, run: () => void s.saveAll() },
      { id: 'c:start', group: 'Commands', label: 'Runtime: Start', icon: <Power size={14} />, run: () => void s.startRuntime() },
      { id: 'c:restart', group: 'Commands', label: 'Runtime: Restart (clears memory, keeps files)', icon: <RotateCcw size={14} />, run: () => void s.restartRuntime() },
      { id: 'c:stop', group: 'Commands', label: 'Runtime: Stop', icon: <Power size={14} />, run: () => s.stopRuntime() },
      { id: 'c:artifacts', group: 'Commands', label: 'Open Artifact Browser', icon: <Boxes size={14} />, run: () => s.openTab({ id: 'artifacts', kind: 'artifacts', title: 'Artifact Browser' }) },
      { id: 'c:lineage', group: 'Commands', label: 'Open Lineage graph', icon: <GitBranch size={14} />, run: () => s.openTab({ id: 'lineage', kind: 'lineage', title: 'Lineage' }) },
      { id: 'c:exp', group: 'Commands', label: 'Open Experiments', icon: <BrainCircuit size={14} />, run: () => s.openTab({ id: 'experiments', kind: 'experiments', title: 'Experiments' }) },
      { id: 'c:api', group: 'Commands', label: 'Open API Tester', icon: <Globe size={14} />, run: () => s.openTab({ id: 'api', kind: 'api', title: 'API Tester' }) },
      { id: 'c:note', group: 'Commands', label: 'New note', icon: <StickyNote size={14} />, run: () => s.addNote() },
      { id: 'c:repl', group: 'Commands', label: 'Focus Python REPL', icon: <Play size={14} />, run: () => { s.setLayout({ bottomOpen: true, bottomView: 'repl' }); setTimeout(() => document.getElementById('repl-input')?.focus(), 50); } },
      { id: 'c:sb', group: 'Commands', label: 'Toggle sidebar', hint: 'Ctrl+B', icon: <PanelLeft size={14} />, run: () => s.setLayout({ sidebarOpen: !s.layout.sidebarOpen }) },
      { id: 'c:bp', group: 'Commands', label: 'Toggle bottom panel', hint: 'Ctrl+J', icon: <PanelBottom size={14} />, run: () => s.setLayout({ bottomOpen: !s.layout.bottomOpen }) },
      { id: 'c:rp', group: 'Commands', label: 'Toggle right panel', hint: 'Ctrl+Alt+B', icon: <PanelRight size={14} />, run: () => s.setLayout({ rightOpen: !s.layout.rightOpen }) },
      { id: 'c:home', group: 'Commands', label: 'Go to dashboard', icon: <Home size={14} />, run: () => nav('/') },
    ];
    const f: Item[] = Object.values(files).sort((a, b) => a.path.localeCompare(b.path)).map((m) => ({
      id: `f:${m.path}`, group: 'Files', label: m.path, hint: fmtBytes(m.size), icon: <FileIcon path={m.path} />, run: () => s.openFile(m.path),
    }));
    const a: Item[] = artifacts.map((x) => ({
      id: `a:${x.path}`, group: 'Artifacts', label: x.path, hint: `${x.type} · v${x.version}`, icon: <ArtifactIcon type={x.type} />,
      run: () => { s.select({ kind: 'artifact', ref: x.path }); s.setLayout({ rightOpen: true, rightView: 'inspector' }); if (files[x.path]) s.openFile(x.path); },
    }));
    const n: Item[] = notes.map((x) => ({ id: `n:${x.id}`, group: 'Notes', label: x.title, hint: x.status, icon: <StickyNote size={14} />, run: () => s.openNote(x.id) }));
    return [...cmds, ...f, ...a, ...n];
  }, [files, artifacts, notes, nav]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.startsWith('>')) { const c = t.slice(1).trim(); return items.filter((i) => i.group === 'Commands' && i.label.toLowerCase().includes(c)); }
    if (!t) return items.filter((i) => i.group !== 'Files').slice(0, 16).concat(items.filter((i) => i.group === 'Files').slice(0, 30));
    const terms = t.split(/\s+/);
    return items.filter((i) => terms.every((x) => i.label.toLowerCase().includes(x) || basename(i.label).toLowerCase().includes(x))).slice(0, 80);
  }, [items, q]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => { listRef.current?.querySelector('.palette-item.on')?.scrollIntoView({ block: 'nearest' }); }, [idx]);

  const choose = (i: Item | undefined) => { if (!i) return; onClose(); i.run(); };
  let lastGroup = '';
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input
          autoFocus
          id="palette-input"
          value={q}
          placeholder="Tìm file, artifact, note… (gõ > để chỉ xem lệnh)"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); choose(filtered[idx]); }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 && <div className="p-12 xs dim">Không có kết quả.</div>}
          {filtered.map((i, k) => {
            const head = i.group !== lastGroup ? i.group : null;
            lastGroup = i.group;
            return (
              <div key={i.id}>
                {head && <div className="group-h" style={{ padding: '8px 12px 2px' }}>{head === 'Commands' && <Command size={10} />}{head}</div>}
                <div className={`palette-item ${k === idx ? 'on' : ''}`} onMouseEnter={() => setIdx(k)} onClick={() => choose(i)}>
                  {i.icon}<span className={i.group === 'Commands' || i.group === 'Notes' ? '' : 'mono'}>{i.label}</span>{i.hint && <span className="hint">{i.hint}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
