import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useWs } from '../state/workspace';
import { ActivityBar, StatusBar, TopBar } from './Chrome';
import Sidebar from './Sidebar';
import EditorArea from './EditorArea';
import BottomPanel from './BottomPanel';
import RightPanel from './RightPanel';
import CommandPalette from './CommandPalette';
import { toast } from '../components/dialogs';

export default function WorkspacePage() {
  const { wsId } = useParams();
  const nav = useNavigate();
  const ws = useWs((s) => s.ws);
  const loading = useWs((s) => s.loading);
  const error = useWs((s) => s.error);
  const layout = useWs((s) => s.layout);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    if (wsId) void useWs.getState().open(wsId);
    return () => useWs.getState().close();
  }, [wsId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      const { setLayout, layout: l, saveAll } = useWs.getState();
      if (k === 'k' || (k === 'p' && !e.shiftKey)) { e.preventDefault(); setPalette(true); }
      else if (k === 's') { e.preventDefault(); void saveAll().then(() => toast('Đã lưu tất cả buffer vào workspace storage', 'success')); }
      else if (k === 'b' && e.altKey) { e.preventDefault(); setLayout({ rightOpen: !l.rightOpen }); }
      else if (k === 'b') { e.preventDefault(); setLayout({ sidebarOpen: !l.sidebarOpen }); }
      else if (k === 'j') { e.preventDefault(); setLayout({ bottomOpen: !l.bottomOpen }); }
    };
    window.addEventListener('keydown', onKey);
    const beforeUnload = (e: BeforeUnloadEvent) => { if (Object.keys(useWs.getState().buffers).length) e.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);

  useEffect(() => {
    if (ws) document.title = `${ws.name} · AI Lab Workspace`;
  }, [ws]);

  if (error) {
    return (
      <div className="center fill">
        <div className="empty">
          <ShieldAlert size={30} className="t-red" />
          <h4>Không mở được workspace</h4>
          <div>{error}</div>
          <button className="btn" onClick={() => nav('/')}>Về trang tổng quan</button>
        </div>
      </div>
    );
  }
  if (loading || !ws) {
    return (
      <div className="center fill">
        <div className="row muted"><Loader2 className="spin" size={18} /> Đang khôi phục workspace từ storage…</div>
      </div>
    );
  }

  return (
    <div className="ws-root">
      <TopBar onSearch={() => setPalette(true)} />
      <div className="ws-body">
        <ActivityBar />
        <Group orientation="horizontal" className="panels" id="ws-h">
          {layout.sidebarOpen && (
            <>
              <Panel id="sidebar" defaultSize={280} minSize={200} maxSize={560}>
                <Sidebar />
              </Panel>
              <Separator className="sep-v" />
            </>
          )}
          <Panel id="center" minSize={420}>
            <Group orientation="vertical" id="ws-v">
              <Panel id="editors" minSize={140}>
                <EditorArea />
              </Panel>
              {layout.bottomOpen && (
                <>
                  <Separator className="sep-h" />
                  <Panel id="bottom" defaultSize={230} minSize={90} maxSize="75">
                    <BottomPanel />
                  </Panel>
                </>
              )}
            </Group>
          </Panel>
          {layout.rightOpen && (
            <>
              <Separator className="sep-v" />
              <Panel id="right" defaultSize={330} minSize={250} maxSize={620}>
                <RightPanel />
              </Panel>
            </>
          )}
        </Group>
      </div>
      <StatusBar />
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}
