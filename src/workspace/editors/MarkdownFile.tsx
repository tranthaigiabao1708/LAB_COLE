import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Eye, PencilLine, Columns2, PanelRight } from 'lucide-react';
import { useWs } from '../../state/workspace';
import { Markdown, PathChip } from '../../components/ui';
import { cmTheme, SaveState, useFileContent } from './shared';

export default function MarkdownFile({ path }: { path: string }) {
  const { content, loaded } = useFileContent(path);
  const [mode, setMode] = useState<'preview' | 'edit' | 'split'>('preview');
  const editor = loaded && (
    <div className="cm-wrap fill">
      <CodeMirror value={content} height="100%" theme={cmTheme} extensions={[markdown()]} onChange={(v) => useWs.getState().setBuffer(path, v)} basicSetup={{ lineNumbers: false, foldGutter: false }} />
    </div>
  );
  const preview = <div className="scroll fill" style={{ padding: '18px 28px' }}><Markdown source={content} /></div>;
  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="toolbar">
        <PathChip path={path} />
        <SaveState path={path} />
        <div className="grow" />
        <button className="btn sm ghost" title="Ghim vào panel phải" onClick={() => useWs.getState().setLayout({ rightOpen: true, rightView: 'docs', docRef: `file:${path}` })}><PanelRight size={13} />Pin</button>
        <div className="seg">
          <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}><Eye size={12} />Preview</button>
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}><PencilLine size={12} />Edit</button>
          <button className={mode === 'split' ? 'on' : ''} onClick={() => setMode('split')}><Columns2 size={12} />Split</button>
        </div>
      </div>
      <div className="grow" style={{ minHeight: 0, display: 'flex' }}>
        {mode !== 'preview' && <div style={{ flex: 1, minWidth: 0, borderRight: mode === 'split' ? '1px solid var(--line)' : undefined }}>{editor}</div>}
        {mode !== 'edit' && <div style={{ flex: 1, minWidth: 0 }}>{preview}</div>}
      </div>
    </div>
  );
}
