import CodeMirror from '@uiw/react-codemirror';
import { Play, Save, Braces, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useWs } from '../../state/workspace';
import { PathChip } from '../../components/ui';
import { toast } from '../../components/dialogs';
import { cmTheme, langFor, SaveState, useFileContent } from './shared';
import { extOf } from '../../lib/format';

export default function CodeEditor({ path }: { path: string }) {
  const { content, loaded } = useFileContent(path);
  const [running, setRunning] = useState(false);
  const ext = extOf(path);
  const { setBuffer, saveFile, execute, setLayout, select } = useWs.getState();
  const runFile = async () => {
    setRunning(true);
    setLayout({ bottomOpen: true, bottomView: 'runs' });
    const { run } = await execute({ code: content, source: path, kind: 'file' });
    setRunning(false);
    select({ kind: 'run', ref: run.id });
    toast(run.status === 'ok' ? `Đã chạy ${path} (${run.outputs.length} file output)` : `${path}: ${run.error?.ename ?? run.status}`, run.status === 'ok' ? 'success' : 'error');
  };
  const format = () => {
    try { setBuffer(path, JSON.stringify(JSON.parse(content), null, 2) + '\n'); } catch (e) { toast(`JSON không hợp lệ: ${(e as Error).message}`, 'error'); }
  };
  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="toolbar">
        <PathChip path={path} />
        <SaveState path={path} />
        <div className="grow" />
        {ext === 'json' && <button className="btn sm ghost" onClick={format}><Braces size={13} />Format</button>}
        <button className="btn sm ghost" onClick={() => void saveFile(path)} title="Ctrl+S"><Save size={13} />Save</button>
        {ext === 'py' && (
          <button className="btn sm primary" disabled={running} onClick={() => void runFile()} title="Chạy toàn bộ file trong runtime (cwd = thư mục gốc workspace)">
            {running ? <Loader2 size={13} className="spin" /> : <Play size={13} />}Run file
          </button>
        )}
      </div>
      <div className="grow cm-wrap" style={{ minHeight: 0 }}>
        {loaded && (
          <CodeMirror
            value={content}
            height="100%"
            theme={cmTheme}
            extensions={langFor(path)}
            onChange={(v) => setBuffer(path, v)}
            basicSetup={{ foldGutter: true, highlightActiveLine: true }}
          />
        )}
      </div>
    </div>
  );
}
