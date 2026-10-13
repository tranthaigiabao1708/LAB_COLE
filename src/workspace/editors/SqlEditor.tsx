import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Play, Loader2, Table2, Database, Info, AlertTriangle } from 'lucide-react';
import { useWs, getRuntimeClient } from '../../state/workspace';
import { DataTable, Empty, PathChip } from '../../components/ui';
import { cmTheme, SaveState, useFileContent } from './shared';
import { fmtDuration } from '../../lib/format';
import type { RunRecord } from '../../lib/types';

export default function SqlEditor({ path }: { path: string }) {
  const { content, loaded } = useFileContent(path);
  const status = useWs((s) => s.runtime.status);
  const alive = status === 'running' || status === 'busy' || status === 'restart-required';
  const [tables, setTables] = useState<{ table: string; path: string }[]>([]);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const fileCount = useWs((s) => Object.keys(s.files).length);

  useEffect(() => {
    if (!alive) return;
    void getRuntimeClient()?.sqlTables().then(setTables).catch(() => setTables([]));
  }, [alive, fileCount]);

  const exec = async () => {
    setBusy(true);
    const r = await useWs.getState().runSql(useWs.getState().buffers[path] ?? content, path);
    setRun(r);
    setBusy(false);
  };
  const km = Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { void exec(); return true; } }]));
  const res = run?.result?.kind === 'dataframe' ? run.result : null;

  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="toolbar">
        <PathChip path={path} />
        <SaveState path={path} />
        <span className="badge outline" title="SQLite in-memory trong runtime; CSV dưới data/ và artifacts/ được nạp thành bảng khi được tham chiếu">engine: sqlite (runtime)</span>
        <div className="grow" />
        <button className="btn sm primary" id="sql-run" disabled={busy} onClick={() => void exec()} title="Ctrl+Enter">{busy ? <Loader2 size={13} className="spin" /> : <Play size={13} />}Run query</button>
      </div>
      <div className="grow" style={{ minHeight: 0, display: 'flex' }}>
        <div style={{ width: 210, borderRight: '1px solid var(--line)', overflow: 'auto', flex: 'none' }} className="pane">
          <div className="group-h"><Database size={11} />Tables</div>
          {!alive && <div className="p-12 xs dim">Khởi động runtime để liệt kê bảng (mỗi CSV = một bảng).</div>}
          {tables.map((t) => (
            <div key={t.path} className="list-item" title={t.path} onClick={() => useWs.getState().setBuffer(path, `SELECT *\nFROM ${t.table}\nLIMIT 100;\n`)}>
              <Table2 size={13} className="t-violet" />
              <div className="li-main"><span className="mono small">{t.table}</span><span className="xs dim ellipsis">{t.path}</span></div>
            </div>
          ))}
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <Group orientation="vertical" id={`sql-${path}`}>
            <Panel id="sql-ed" minSize={80} defaultSize="45">
              <div className="cm-wrap fill">
                {loaded && <CodeMirror value={content} height="100%" theme={cmTheme} extensions={[sql(), km]} onChange={(v) => useWs.getState().setBuffer(path, v)} />}
              </div>
            </Panel>
            <Separator className="sep-h" />
            <Panel id="sql-res" minSize={80}>
              <div className="col fill" style={{ gap: 0 }}>
                <div className="toolbar" style={{ height: 30 }}>
                  <span className="upper">Result</span>
                  {run && <span className={`badge ${run.status === 'ok' ? 'green' : 'red'}`}>{run.status}</span>}
                  {res && <span className="num xs muted">{res.shape[0].toLocaleString()} rows × {res.shape[1]} · {fmtDuration(run?.durationMs)}{res.truncated ? ' · showing first 500' : ''}</span>}
                  {run && run.inputs.length > 0 && <span className="xs dim">· read {run.inputs.join(', ')}</span>}
                  <div className="grow" />
                  {res && <span className="badge violet" title="Kết quả truy vấn chỉ hiển thị, chưa được lưu. Dùng pandas để ghi ra artifact nếu cần.">◆ not persisted</span>}
                </div>
                <div className="grow scroll">
                  {!run && <Empty icon={<Info size={22} />} title="Chưa chạy truy vấn">Ctrl+Enter để chạy. Truy vấn được ghi lại trong Runs.</Empty>}
                  {run?.status === 'error' && <div className="p-12"><div className="callout red"><AlertTriangle size={14} /><pre className="stream err">{run.error?.evalue}</pre></div></div>}
                  {res && <DataTable columns={res.columns} rows={res.rows} />}
                </div>
              </div>
            </Panel>
          </Group>
        </div>
      </div>
    </div>
  );
}
