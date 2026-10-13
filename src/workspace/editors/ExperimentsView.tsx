import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, FlaskConical, ExternalLink } from 'lucide-react';
import { useWs } from '../../state/workspace';
import { ConfusionMatrix, Empty, LineChart } from '../../components/ui';
import { fmtDateTime, fmtNum, basename } from '../../lib/format';

const COLORS = ['hsl(188 86% 55%)', 'hsl(266 88% 74%)', 'hsl(38 94% 60%)', 'hsl(146 62% 50%)', 'hsl(340 82% 68%)', 'hsl(213 92% 66%)'];

export default function ExperimentsView() {
  const experiments = useWs((s) => s.experiments);
  const artifacts = useWs((s) => s.artifacts);
  const files = useWs((s) => s.files);
  const selection = useWs((s) => s.selection);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    setPicked((p) => (p.length ? p.filter((id) => experiments.some((e) => e.id === id)) : experiments.slice(0, 4).map((e) => e.id)));
  }, [experiments]);
  useEffect(() => {
    if (selection?.kind === 'experiment') setPicked((p) => (p.includes(selection.ref) ? p : [...p, selection.ref]));
  }, [selection]);
  const metricKeys = useMemo(() => Array.from(new Set(experiments.flatMap((e) => Object.keys(e.metrics)))), [experiments]);
  const sel = experiments.filter((e) => picked.includes(e.id));
  const paramKeys = Array.from(new Set(sel.flatMap((e) => Object.keys(e.params))));
  const { select, openFile } = useWs.getState();

  if (!experiments.length) {
    return (
      <Empty icon={<FlaskConical size={28} />} title="Chưa có experiment nào">
        Ghi lại thí nghiệm từ code bằng:
        <pre className="stream" style={{ textAlign: 'left', marginTop: 8, padding: 10, background: 'var(--bg-1)', borderRadius: 6 }}>{`import lab
lab.log_experiment(name="churn-rf", metrics={"f1": f1}, params={...},
                   model_path=lab.save_model(model, "models/rf.pkl"))`}</pre>
        Bản ghi được lưu ở <span className="mono">experiments/*.json</span> trong workspace storage.
      </Empty>
    );
  }

  return (
    <div className="scroll fill">
      <div className="toolbar" style={{ height: 44, position: 'sticky', top: 0, zIndex: 2 }}>
        <BrainCircuit size={15} className="t-amber" />
        <span className="strong">Models & Experiments</span>
        <span className="xs muted">{experiments.length} experiments · chọn để so sánh ({sel.length})</span>
      </div>
      <div className="p-12">
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="list-table">
            <thead><tr><th /><th>Experiment</th><th>Model</th><th>Dataset</th>{metricKeys.map((k) => <th key={k} style={{ textAlign: 'right' }}>{k}</th>)}<th>Duration</th><th>Created</th><th>Model artifact</th></tr></thead>
            <tbody>
              {experiments.map((e, i) => {
                const art = artifacts.find((a) => a.path === e.model_path);
                const best = (k: string) => Math.max(...experiments.map((x) => x.metrics[k] ?? -Infinity)) === e.metrics[k];
                return (
                  <tr key={e.id} className={`clickable ${picked.includes(e.id) ? 'selected' : ''}`} onClick={() => setPicked((p) => (p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id]))}>
                    <td><input type="checkbox" checked={picked.includes(e.id)} readOnly aria-label={`Compare ${e.name}`} style={{ accentColor: COLORS[i % COLORS.length] }} /></td>
                    <td><div className="col" style={{ gap: 0 }}><span className="strong small">{e.name}</span><span className="xs dim mono">{e.id}</span></div></td>
                    <td className="xs">{e.model_type}<div className="dim">{e.framework}</div></td>
                    <td className="xs mono dim">{e.dataset ? basename(e.dataset) : '—'}</td>
                    {metricKeys.map((k) => <td key={k} className={`num ${best(k) ? 't-green strong' : ''}`} style={{ textAlign: 'right' }}>{e.metrics[k] != null ? fmtNum(e.metrics[k]) : '—'}</td>)}
                    <td className="num xs">{e.duration_s != null ? `${e.duration_s.toFixed(2)} s` : '—'}</td>
                    <td className="xs">{fmtDateTime(e.created_at * 1000)}</td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      {e.model_path ? (
                        <button className="btn ghost sm" onClick={() => select({ kind: 'artifact', ref: e.model_path! })}>
                          <span className="mono xs">{basename(e.model_path)}</span>
                          {art ? <span className="badge accent">v{art.version}</span> : files[e.model_path] ? <span className="badge teal">file</span> : <span className="badge red">missing</span>}
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {sel.length > 0 && (
        <div className="p-12 col gap-12" style={{ paddingTop: 0 }}>
          <div className="grid-2">
            <div className="chart-box">
              <div className="upper" style={{ marginBottom: 8 }}>Metrics comparison</div>
              <div className="col gap-12">
                {metricKeys.map((k) => {
                  const max = Math.max(...sel.map((e) => e.metrics[k] ?? 0), 1e-9);
                  return (
                    <div key={k} className="col gap-4">
                      <span className="xs muted mono">{k}</span>
                      {sel.map((e) => {
                        const ci = experiments.indexOf(e) % COLORS.length;
                        const v = e.metrics[k];
                        return (
                          <div key={e.id} className="bar-row" style={{ gridTemplateColumns: '150px 1fr 60px' }}>
                            <span className="ellipsis xs">{e.name}</span>
                            <div className="bar-track"><div className="bar-fill" style={{ width: `${((v ?? 0) / max) * 100}%`, background: COLORS[ci] }} /></div>
                            <span className="num xs" style={{ textAlign: 'right' }}>{v != null ? fmtNum(v) : '—'}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="chart-box">
              <div className="upper" style={{ marginBottom: 8 }}>Parameters</div>
              <table className="list-table">
                <thead><tr><th>param</th>{sel.map((e) => <th key={e.id}>{e.name}</th>)}</tr></thead>
                <tbody>
                  {paramKeys.map((p) => {
                    const vals = sel.map((e) => JSON.stringify(e.params[p] ?? null));
                    const differs = new Set(vals).size > 1;
                    return <tr key={p}><td className="mono xs">{p}</td>{vals.map((v, i) => <td key={i} className={`mono xs ${differs ? 't-amber' : ''}`}>{v === 'null' ? '—' : v}</td>)}</tr>;
                  })}
                </tbody>
              </table>
              {sel.some((e) => e.history) && (
                <div style={{ marginTop: 12 }}>
                  <div className="upper" style={{ marginBottom: 6 }}>Training history</div>
                  <LineChart series={sel.flatMap((e) => Object.entries(e.history ?? {}).map(([k, v]) => ({ name: `${e.name}:${k}`, values: v, color: COLORS[experiments.indexOf(e) % COLORS.length] })))} />
                  <div className="xs dim">{sel.filter((e) => e.history).map((e) => `${e.name}: ${Object.keys(e.history!).join(', ')}`).join(' · ')}</div>
                </div>
              )}
            </div>
          </div>
          <div className="grid-3">
            {sel.filter((e) => e.confusion_matrix).map((e) => (
              <div key={e.id} className="chart-box">
                <div className="row" style={{ marginBottom: 8 }}><span className="upper grow">Confusion matrix · {e.name}</span>{e.run_id && <button className="btn ghost sm" onClick={() => { useWs.getState().openTab({ id: `run:${e.run_id}`, kind: 'run', title: `Run ${e.run_id!.slice(-4)}`, ref: e.run_id! }); }}><ExternalLink size={11} />run</button>}</div>
                <ConfusionMatrix matrix={e.confusion_matrix!} labels={e.labels} />
              </div>
            ))}
          </div>
          <div className="xs dim">Nguồn: <span className="mono">{sel.map((e) => e.file).join(', ')}</span> · <a href="#" onClick={(ev) => { ev.preventDefault(); openFile(sel[0].file); }}>mở JSON</a></div>
        </div>
      )}
    </div>
  );
}
