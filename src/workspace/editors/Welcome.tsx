import { Boxes, GitBranch, NotebookPen, Play, StickyNote, Database } from 'lucide-react';
import { useWs } from '../../state/workspace';

export default function Welcome() {
  const files = useWs((s) => s.files);
  const nbs = Object.keys(files).filter((p) => p.endsWith('.ipynb')).sort();
  const { openFile, openTab, startRuntime, addNote } = useWs.getState();
  return (
    <div className="center fill">
      <div className="col gap-16" style={{ maxWidth: 520, padding: 24 }}>
        <div>
          <div className="upper">Workspace</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 20 }}>Không có tab nào đang mở</h2>
          <p className="muted small">Mở file từ Explorer, hoặc bắt đầu nhanh:</p>
        </div>
        <div className="col gap-4">
          {nbs.map((p) => <button key={p} className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => openFile(p)}><NotebookPen size={14} />{p}</button>)}
          <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => void startRuntime()}><Play size={14} />Start runtime</button>
          <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => openTab({ id: 'artifacts', kind: 'artifacts', title: 'Artifact Browser' })}><Boxes size={14} />Artifact Browser</button>
          <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => openTab({ id: 'lineage', kind: 'lineage', title: 'Lineage' })}><GitBranch size={14} />Lineage graph</button>
          <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => useWs.getState().setLayout({ sidebarOpen: true, sidebarView: 'data' })}><Database size={14} />Datasets</button>
          <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => addNote()}><StickyNote size={14} />New note</button>
        </div>
        <div className="xs dim">Phím tắt: <kbd>Ctrl K</kbd> tìm kiếm · <kbd>Ctrl S</kbd> lưu · <kbd>Ctrl B</kbd> sidebar · <kbd>Ctrl J</kbd> panel dưới · <kbd>Shift Enter</kbd> chạy cell</div>
      </div>
    </div>
  );
}
