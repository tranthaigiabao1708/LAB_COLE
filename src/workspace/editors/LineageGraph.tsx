import { useMemo, useState } from 'react';
import { GitBranch, ZoomIn, ZoomOut, AlertTriangle, XCircle } from 'lucide-react';
import { useWs } from '../../state/workspace';
import { Empty, ArtifactTypeBadge } from '../../components/ui';
import { basename, fmtBytes, fmtDuration } from '../../lib/format';
import { buildLineage, type LNode } from '../lineage';

const W = 214, H = 78, GX = 96, GY = 24, PAD = 32;

export default function LineageGraph() {
  const artifacts = useWs((s) => s.artifacts);
  const files = useWs((s) => s.files);
  const runs = useWs((s) => s.runs);
  const edges = useWs((s) => s.edges);
  const selection = useWs((s) => s.selection);
  const [scale, setScale] = useState(1);
  const g = useMemo(() => buildLineage(artifacts, files, runs, edges), [artifacts, files, runs, edges]);
  const pos = (n: LNode) => ({ x: PAD + n.depth * (W + GX), y: PAD + 36 + n.row * (H + GY) });
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const maxDepth = Math.max(0, ...g.nodes.map((n) => n.depth));
  const maxRow = Math.max(0, ...g.nodes.map((n) => n.row));
  const width = PAD * 2 + (maxDepth + 1) * (W + GX);
  const height = PAD * 2 + 36 + (maxRow + 1) * (H + GY);
  const { select } = useWs.getState();
  const selected = selection && (selection.kind === 'artifact' || selection.kind === 'file') ? selection.ref : null;

  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="toolbar" style={{ height: 44 }}>
        <GitBranch size={15} className="t-teal" />
        <span className="strong">Data lineage & pipeline</span>
        <span className="xs muted">{g.nodes.length} nodes · {g.edges.filter((e) => e.kind === 'auto').length} auto · {g.edges.filter((e) => e.kind === 'session').length} session · {g.edges.filter((e) => e.kind === 'manual').length} manual</span>
        <div className="grow" />
        <span className="row xs muted" style={{ gap: 14 }}>
          <span className="row gap-4"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="hsl(188 60% 55%)" strokeWidth="2" /></svg>auto-captured (runtime I/O)</span>
          <span className="row gap-4" title="File được đọc ở lần chạy trước trong cùng session; dữ liệu có thể đã đi qua bộ nhớ. Suy luận, không phải ghi nhận trực tiếp."><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--c-teal)" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" /></svg>same session (inferred)</span>
          <span className="row gap-4"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--c-violet)" strokeWidth="2" strokeDasharray="4 3" /></svg>manual (declared)</span>
          <span className="row gap-4"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--c-amber)" strokeWidth="2" /></svg>stale input</span>
        </span>
        <div className="sep" />
        <button className="icon-btn" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} title="Zoom out"><ZoomOut size={15} /></button>
        <span className="num xs">{Math.round(scale * 100)}%</span>
        <button className="icon-btn" onClick={() => setScale((s) => Math.min(1.6, s + 0.1))} title="Zoom in"><ZoomIn size={15} /></button>
      </div>
      <div className="lineage-canvas grow">
        {g.nodes.length === 0 ? (
          <Empty icon={<GitBranch size={28} />} title="Chưa có lineage">
            Lineage được ghi nhận khi code trong runtime <b>đọc</b> một file và <b>ghi</b> file khác trong cùng một lần chạy (qua <span className="mono">open()</span>/pandas).
            Bạn cũng có thể khai báo liên kết thủ công ở sidebar Lineage.
          </Empty>
        ) : (
          <div style={{ position: 'relative', width: width * scale, height: height * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width, height, position: 'absolute' }}>
              {Array.from({ length: maxDepth + 1 }).map((_, d) => (
                <div key={d} className="upper" style={{ position: 'absolute', left: PAD + d * (W + GX), top: PAD }}>
                  {d === 0 ? 'Sources' : `Stage ${d}`}
                </div>
              ))}
              <svg width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                <defs>
                  <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(188 60% 55%)" /></marker>
                  <marker id="arr-m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(266 88% 74%)" /></marker>
                  <marker id="arr-s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(38 94% 60%)" /></marker>
                </defs>
                {g.edges.map((e) => {
                  const a = byId.get(e.from), b = byId.get(e.to);
                  if (!a || !b) return null;
                  const p1 = pos(a), p2 = pos(b);
                  const x1 = p1.x + W, y1 = p1.y + H / 2, x2 = p2.x - 2, y2 = p2.y + H / 2;
                  const back = x2 <= x1;
                  const dx = back ? 80 : Math.max(40, (x2 - x1) / 2);
                  const stale = e.kind === 'auto' && b.staleInputs.includes(e.from);
                  const color = e.kind === 'manual' ? 'hsl(266 88% 74%)' : e.kind === 'session' ? 'hsl(168 70% 48%)' : stale ? 'hsl(38 94% 60%)' : 'hsl(188 60% 55%)';
                  const hl = selected && (selected === e.from || selected === e.to);
                  return (
                    <path key={e.id} d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`} fill="none" stroke={color}
                      strokeWidth={hl ? 2.6 : 1.6} strokeOpacity={selected && !hl ? 0.35 : e.kind === 'session' ? 0.7 : 0.9}
                      strokeDasharray={e.kind === 'manual' ? '6 4' : e.kind === 'session' ? '1 5' : undefined} strokeLinecap="round"
                      markerEnd={`url(#${e.kind === 'manual' ? 'arr-m' : stale ? 'arr-s' : 'arr'})`}>
                      <title>{`${e.kind} · ${e.label}`}</title>
                    </path>
                  );
                })}
              </svg>
              {g.nodes.map((n) => {
                const p = pos(n);
                const isSel = selected === n.id;
                return (
                  <div key={n.id} className={`lnode fade-in ${isSel ? 'on' : ''} ${n.stale ? 'stale' : ''} ${!n.exists ? 'missing' : ''}`} style={{ left: p.x, top: p.y, height: H }}
                    onClick={() => n.kind !== 'manual' && select({ kind: n.artifact ? 'artifact' : 'file', ref: n.id })}
                    title={n.id}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="ln-name grow">{n.kind === 'manual' ? n.label : basename(n.id)}</span>
                      {n.failedRun && <XCircle size={13} className="t-red" aria-label="Last attempt failed" />}
                      {n.stale && <AlertTriangle size={13} className="t-amber" aria-label="Stale" />}
                    </div>
                    <div className="row xs muted" style={{ gap: 6 }}>
                      {n.artifact ? <ArtifactTypeBadge type={n.artifact.type} /> : n.kind === 'manual' ? <span className="badge violet">manual step</span> : <span className="badge outline">source file</span>}
                      {n.artifact && <span className="num">v{n.artifact.version}</span>}
                      {(n.artifact || n.file) && <span className="num">{fmtBytes(n.artifact?.size ?? n.file?.size)}</span>}
                      {n.producedBy?.durationMs != null && <span className="num">· {fmtDuration(n.producedBy.durationMs)}</span>}
                    </div>
                    <div className="xs dim ellipsis">
                      {n.kind === 'manual' ? 'không có dữ liệu runtime' : !n.exists ? 'file missing in storage' : n.failedRun ? `last attempt failed: ${n.failedRun.error?.ename}` : n.stale ? 'input changed after creation' : n.artifact ? n.artifact.source : 'persisted'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
