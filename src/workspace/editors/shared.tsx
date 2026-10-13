import { useEffect, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { Loader2, HardDrive, PencilLine, AlertTriangle } from 'lucide-react';
import { useWs } from '../../state/workspace';
import { extOf, fmtTime } from '../../lib/format';

export const cmTheme = [
  vscodeDark,
  EditorView.theme({
    '&': { backgroundColor: 'var(--bg-0)' },
    '.cm-gutters': { backgroundColor: 'var(--bg-0)', borderRight: '1px solid var(--line)', color: 'var(--fg-3)' },
    '.cm-activeLine': { backgroundColor: 'hsl(210 30% 50% / 0.06)' },
    '.cm-activeLineGutter': { backgroundColor: 'hsl(210 30% 50% / 0.08)' },
    '.cm-content': { fontFamily: 'var(--font-mono)' },
  }),
];
export const cellTheme = [
  vscodeDark,
  EditorView.theme({
    '&': { backgroundColor: 'var(--bg-1)', fontSize: '13px' },
    '.cm-gutters': { backgroundColor: 'var(--bg-1)', border: 'none', color: 'var(--fg-3)' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
    '&.cm-focused .cm-activeLine': { backgroundColor: 'hsl(210 30% 50% / 0.06)' },
    '.cm-content': { fontFamily: 'var(--font-mono)', padding: '6px 0' },
  }),
];

export function langFor(path: string) {
  const ext = extOf(path);
  if (ext === 'py') return [python()];
  if (ext === 'sql') return [sql()];
  if (ext === 'md') return [markdown()];
  if (ext === 'json' || ext === 'ipynb') return [json()];
  return [];
}

/** Current editor content: unsaved buffer if any, otherwise persisted content. */
export function useFileContent(path: string) {
  const buffer = useWs((s) => s.buffers[path]);
  const persisted = useWs((s) => s.contents[path]);
  const exists = useWs((s) => !!s.files[path]);
  const [loaded, setLoaded] = useState(persisted !== undefined);
  useEffect(() => {
    let alive = true;
    void useWs.getState().readFile(path).then(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [path]);
  return { content: buffer ?? persisted ?? '', loaded: loaded || persisted !== undefined, dirty: buffer !== undefined, exists };
}

/** Distinguishes editor buffer state from persisted file state. */
export function SaveState({ path }: { path: string }) {
  const dirty = useWs((s) => path in s.buffers);
  const saving = useWs((s) => s.saving[path]);
  const meta = useWs((s) => s.files[path]);
  if (!meta) return <span className="badge red"><AlertTriangle size={10} />Not in storage</span>;
  if (saving) return <span className="badge amber"><Loader2 size={10} className="spin" />Saving…</span>;
  if (dirty) return <span className="badge amber" title="Thay đổi đang nằm trong editor buffer, sẽ tự lưu sau ~1s"><PencilLine size={10} />Unsaved buffer</span>;
  return <span className="badge teal" title={`Đã ghi vào workspace storage lúc ${new Date(meta.updatedAt).toLocaleString()}`}><HardDrive size={10} />Persisted · {fmtTime(meta.updatedAt)}</span>;
}
