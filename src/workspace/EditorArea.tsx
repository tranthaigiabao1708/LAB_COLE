import { Group, Panel, Separator } from 'react-resizable-panels';
import { Columns2, X, Boxes, GitBranch, BrainCircuit, TerminalSquare, Globe, BookOpen, Database, LayoutGrid } from 'lucide-react';
import { useWs, type GroupId } from '../state/workspace';
import type { Tab } from '../lib/types';
import { FileIcon } from '../components/ui';
import NotebookEditor from './editors/NotebookEditor';
import CodeEditor from './editors/CodeEditor';
import SqlEditor from './editors/SqlEditor';
import MarkdownFile from './editors/MarkdownFile';
import DataViewer from './editors/DataViewer';
import ArtifactBrowser from './editors/ArtifactBrowser';
import LineageGraph from './editors/LineageGraph';
import ExperimentsView from './editors/ExperimentsView';
import RunDetail from './editors/RunDetail';
import ApiTester from './editors/ApiTester';
import LabView from './editors/LabView';
import BinaryView from './editors/BinaryView';
import Welcome from './editors/Welcome';

function TabIcon({ tab }: { tab: Tab }) {
  switch (tab.kind) {
    case 'artifacts': return <Boxes size={13} className="t-accent" />;
    case 'lineage': return <GitBranch size={13} className="t-teal" />;
    case 'experiments': return <BrainCircuit size={13} className="t-amber" />;
    case 'run': return <TerminalSquare size={13} className="t-blue" />;
    case 'api': return <Globe size={13} className="t-accent" />;
    case 'lab': return <BookOpen size={13} className="t-violet" />;
    case 'data': return tab.ref?.startsWith('var:') ? <Database size={13} className="t-violet" /> : <FileIcon path={tab.ref ?? ''} size={13} />;
    default: return <FileIcon path={tab.ref ?? ''} size={13} />;
  }
}

function TabContent({ tab, group }: { tab: Tab; group: GroupId }) {
  const ref = tab.ref ?? '';
  switch (tab.kind) {
    case 'notebook': return <NotebookEditor path={ref} />;
    case 'code': return <CodeEditor path={ref} />;
    case 'json': return <CodeEditor path={ref} />;
    case 'sql': return <SqlEditor path={ref} />;
    case 'markdown': return <MarkdownFile path={ref} />;
    case 'data': return <DataViewer target={ref.startsWith('var:') ? { kind: 'var', expr: ref.slice(4) } : { kind: 'file', path: ref }} group={group} />;
    case 'artifacts': return <ArtifactBrowser />;
    case 'lineage': return <LineageGraph />;
    case 'experiments': return <ExperimentsView />;
    case 'run': return <RunDetail runId={ref} />;
    case 'api': return <ApiTester />;
    case 'lab': return <LabView labId={ref} />;
    case 'binary': return <BinaryView path={ref} />;
    default: return <Welcome />;
  }
}

function EditorGroup({ id }: { id: GroupId }) {
  const g = useWs((s) => s.layout.groups[id]);
  const buffers = useWs((s) => s.buffers);
  const { setActiveTab, closeTab, openTab } = useWs.getState();
  const active = g.tabs.find((t) => t.id === g.active) ?? g.tabs[0];
  return (
    <div className="egroup">
      <div className="tabbar" role="tablist">
        {g.tabs.map((t) => {
          const dirty = t.ref && t.ref in buffers;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={t.id === active?.id}
              className={`etab ${t.id === active?.id ? 'on' : ''}`}
              title={t.ref ?? t.title}
              onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(t.id, id); } }}
              onClick={() => setActiveTab(t.id, id)}
            >
              <TabIcon tab={t} />
              <span className="ellipsis">{t.title}</span>
              {dirty ? <span className="dirty-dot" title="Unsaved buffer" /> : null}
              <button className="x" aria-label={`Close ${t.title}`} onClick={(e) => { e.stopPropagation(); closeTab(t.id, id); }}><X size={12} /></button>
            </div>
          );
        })}
        <div className="tabbar-acts">
          {id === 'main' && active && (
            <button className="icon-btn" title="Open active tab to the side (split view)" onClick={() => openTab(active, 'side')}><Columns2 size={15} /></button>
          )}
          {id === 'side' && <button className="icon-btn" title="Close split" onClick={() => g.tabs.forEach((t) => closeTab(t.id, 'side'))}><X size={15} /></button>}
        </div>
      </div>
      <div className="ebody">
        {g.tabs.map((t) => (
          <div key={t.id} style={{ display: t.id === active?.id ? 'block' : 'none', height: '100%' }}>
            <TabContent tab={t} group={id} />
          </div>
        ))}
        {!active && <Welcome />}
      </div>
    </div>
  );
}

export default function EditorArea() {
  const sideTabs = useWs((s) => s.layout.groups.side.tabs.length);
  const mainTabs = useWs((s) => s.layout.groups.main.tabs.length);
  if (!sideTabs) return <EditorGroup id="main" />;
  return (
    <Group orientation="horizontal" id="editor-split">
      <Panel id="eg-main" minSize={280}>
        {mainTabs ? <EditorGroup id="main" /> : <div className="egroup center"><div className="empty"><LayoutGrid size={22} /><h4>Nhóm chính trống</h4></div></div>}
      </Panel>
      <Separator className="sep-v" />
      <Panel id="eg-side" minSize={280} defaultSize="45">
        <EditorGroup id="side" />
      </Panel>
    </Group>
  );
}
