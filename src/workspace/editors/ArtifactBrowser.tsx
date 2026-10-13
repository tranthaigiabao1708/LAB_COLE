import { useMemo, useState } from 'react';
import { Boxes, Copy, Download, ExternalLink, Search, AlertTriangle } from 'lucide-react';
import { useWs, tabKindFor } from '../../state/workspace';
import { storage } from '../../adapters/storage';
import { ArtifactIcon, ArtifactTypeBadge, Empty } from '../../components/ui';
import { toast } from '../../components/dialogs';
import { basename, copyText, downloadContent, fmtBytes, fmtDateTime } from '../../lib/format';
import type { ArtifactType } from '../../lib/types';
import { buildLineage } from '../lineage';

export default function ArtifactBrowser() {
  const artifacts = useWs((s) => s.artifacts);
  const files = useWs((s) => s.files);
  const runs = useWs((s) => s.runs);
  const edges = useWs((s) => s.edges);
  const selection = useWs((s) => s.selection);
  const ws = useWs((s) => s.ws)!;
  const [type, setType] = useState<ArtifactType | 'all'>('all');
  const [q, setQ] = useState('');
  const stale = useMemo(() => new Set(buildLineage(artifacts, files, runs, edges).nodes.filter((n) => n.stale).map((n) => n.id)), [artifacts, files, runs, edges]);
  const types = useMemo(() => {
    const m = new Map<ArtifactType, number>();
    artifacts.forEach((a) => m.set(a.type, (m.get(a.type) ?? 0) + 1));
    return [...m.entries()];
  }, [artifacts]);
  const list = artifacts
    .filter((a) => (type === 'all' || a.type === type) && (!q || a.path.toLowerCase().includes(q.toLowerCase()) || a.source.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const { select, openFile } = useWs.getState();

  const download = async (path: string) => {
    const c = useWs.getState().contents[path] ?? (await storage.readFile(ws.id, path));
    if (c === undefined || !files[path]) return toast('File không còn trong storage', 'error');
    downloadContent(basename(path), c, files[path].encoding);
  };

  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="toolbar" style={{ height: 44 }}>
        <Boxes size={15} className="t-accent" />
        <span className="strong">Artifact Browser</span>
        <span className="muted xs">{artifacts.length} artifacts · {fmtBytes(artifacts.reduce((a, x) => a + x.size, 0))}</span>
        <div className="sep" />
        <div className="seg">
          <button className={type === 'all' ? 'on' : ''} onClick={() => setType('all')}>All</button>
          {types.map(([t, n]) => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t} <span className="dim">{n}</span></button>)}
        </div>
        <div className="grow" />
        <div className="row"><Search size={13} className="dim" /><input className="input" placeholder="Tìm theo path hoặc nguồn…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} /></div>
      </div>
      <div className="grow scroll">
        {artifacts.length === 0 ? (
          <Empty icon={<Boxes size={28} />} title="Chưa có artifact nào">
            Chạy code ghi file, ví dụ <span className="mono">df.to_csv("artifacts/clean.csv")</span>. Runtime sẽ phát hiện file mới, lưu vào storage và đăng ký artifact kèm run tạo ra nó cùng input đã đọc.
          </Empty>
        ) : (
          <table className="list-table">
            <thead><tr><th>Artifact</th><th>Type</th><th>Ver</th><th>Size</th><th>Updated</th><th>Produced by</th><th>Inputs</th><th>Storage</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.map((a) => {
                const exists = !!files[a.path];
                const isStale = stale.has(a.path);
                const sel = selection?.kind === 'artifact' && selection.ref === a.path;
                return (
                  <tr key={a.id} className={`clickable ${sel ? 'selected' : ''}`} onClick={() => select({ kind: 'artifact', ref: a.path })} onDoubleClick={() => exists && openFile(a.path)}>
                    <td><div className="row"><ArtifactIcon type={a.type} /><div className="col" style={{ gap: 0 }}><span className="mono small">{basename(a.path)}</span><span className="xs dim mono">{a.path}</span></div></div></td>
                    <td><ArtifactTypeBadge type={a.type} /></td>
                    <td className="num">v{a.version}</td>
                    <td className="num xs">{fmtBytes(a.size)}</td>
                    <td className="xs">{fmtDateTime(a.updatedAt)}</td>
                    <td className="xs"><span className="ellipsis" style={{ display: 'inline-block', maxWidth: 220 }} title={a.source}>{a.source}</span>{a.registration === 'manual' && <span className="badge outline" style={{ marginLeft: 4 }}>manual</span>}</td>
                    <td className="num xs">{a.inputs.length || '—'}</td>
                    <td className="xs mono dim">{a.storage.backend}</td>
                    <td>
                      {!exists ? <span className="badge red">file missing</span>
                        : isStale ? <span className="badge amber" title="Một input đã thay đổi sau khi artifact được tạo"><AlertTriangle size={10} />stale</span>
                        : <span className="badge teal">persisted</span>}
                    </td>
                    <td>
                      <div className="row gap-4" onClick={(e) => e.stopPropagation()}>
                        <button className="icon-btn sm" title={`Open with ${tabKindFor(a.path)} viewer`} disabled={!exists} onClick={() => openFile(a.path)}><ExternalLink size={13} /></button>
                        <button className="icon-btn sm" title="Download" disabled={!exists} onClick={() => void download(a.path)}><Download size={13} /></button>
                        <button className="icon-btn sm" title="Copy internal URI" onClick={async () => { if (await copyText(a.storage.uri)) toast('Đã copy ' + a.storage.uri, 'success'); }}><Copy size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
