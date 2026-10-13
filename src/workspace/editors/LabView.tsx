import { useEffect, useState } from 'react';
import { BookOpen, Copy, PanelRight, Lock, Image as ImageIcon, BrainCircuit, FileQuestion } from 'lucide-react';
import { useWs } from '../../state/workspace';
import { templateById } from '../../adapters/templates';
import { Empty, Markdown, PathChip } from '../../components/ui';
import { toast } from '../../components/dialogs';
import { extOf, fmtBytes } from '../../lib/format';
import { SaveState } from './shared';

export function LabView({ labId }: { labId: string }) {
  const ws = useWs((s) => s.ws)!;
  const lab = templateById(ws.templateId)?.labs.find((l) => l.id === labId);
  if (!lab) return <Empty title="Không tìm thấy tài liệu" />;
  const copy = async () => {
    const path = `docs/${lab.id}.md`;
    try { await useWs.getState().createFile(path, lab.body); toast(`Đã sao chép vào ${path}. Bạn có thể ghi chú trực tiếp.`, 'success'); }
    catch (e) { toast((e as Error).message, 'warn'); }
  };
  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="toolbar">
        <BookOpen size={14} className="t-violet" />
        <span className="strong small">{lab.title}</span>
        <span className="badge outline"><Lock size={10} />read-only · {lab.author}</span>
        <div className="grow" />
        <button className="btn sm ghost" onClick={() => useWs.getState().setLayout({ rightOpen: true, rightView: 'docs', docRef: `lab:${lab.id}` })}><PanelRight size={13} />Pin</button>
        <button className="btn sm" onClick={() => void copy()}><Copy size={13} />Copy to workspace</button>
      </div>
      <div className="grow scroll" style={{ padding: '20px 32px' }}><Markdown source={lab.body} /></div>
    </div>
  );
}
export default LabView;

export function BinaryViewImpl({ path }: { path: string }) {
  const meta = useWs((s) => s.files[path]);
  const artifact = useWs((s) => s.artifacts.find((a) => a.path === path));
  const exp = useWs((s) => s.experiments.find((e) => e.model_path === path));
  const [content, setContent] = useState<string | undefined>();
  useEffect(() => { void useWs.getState().readFile(path).then(setContent); }, [path, meta?.updatedAt]);
  const ext = extOf(path);
  const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
  const isModel = ['pkl', 'joblib', 'pt', 'pth', 'onnx', 'h5'].includes(ext);
  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="toolbar"><PathChip path={path} />{meta && <SaveState path={path} />}<span className="xs muted num">{fmtBytes(meta?.size)}</span>{artifact && <span className="badge accent">artifact v{artifact.version}</span>}</div>
      <div className="grow scroll p-16">
        {meta?.notSynced && <div className="callout red" style={{ marginBottom: 12 }}>File quá lớn nên chưa đồng bộ về storage. Nó chỉ tồn tại trong runtime hiện tại.</div>}
        {isImg && content && <div className="col gap-12"><img src={`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${content}`} alt={path} style={{ maxWidth: '100%', background: '#fff', borderRadius: 6, alignSelf: 'flex-start' }} /><span className="xs dim row"><ImageIcon size={12} />Ảnh đã lưu bền vững trong workspace storage.</span></div>}
        {isModel && (
          <div className="card" style={{ maxWidth: 720 }}>
            <div className="card-h"><BrainCircuit size={15} className="t-accent" /><h3>Model artifact</h3></div>
            <div className="card-b">
              <dl className="kv">
                <dt>Format</dt><dd className="mono">{ext}{ext === 'pkl' ? ' (Python pickle: chỉ load trong runtime tin cậy)' : ''}</dd>
                <dt>Size</dt><dd className="num">{fmtBytes(meta?.size)}</dd>
                {exp && <><dt>Model type</dt><dd>{exp.model_type} · {exp.framework}</dd>
                  <dt>Experiment</dt><dd className="mono">{exp.name} ({exp.id})</dd>
                  <dt>Metrics</dt><dd className="mono xs">{Object.entries(exp.metrics).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(3) : v}`).join('  ')}</dd>
                  <dt>Trained on</dt><dd className="mono">{exp.dataset}</dd></>}
                {artifact && <><dt>Storage</dt><dd className="mono xs">{artifact.storage.uri}</dd><dt>Versions</dt><dd>{artifact.history.length}</dd></>}
              </dl>
              {!exp && <div className="xs dim" style={{ marginTop: 8 }}>Không có experiment record liên kết. Dùng <span className="mono">lab.log_experiment(model_path=...)</span> để gắn metadata.</div>}
              <pre className="stream" style={{ marginTop: 12, background: 'var(--bg-0)', padding: 10, borderRadius: 6 }}>{`import pickle\nwith open("${path}", "rb") as f:\n    model = pickle.load(f)`}</pre>
            </div>
          </div>
        )}
        {!isImg && !isModel && <Empty icon={<FileQuestion size={26} />} title="Không có trình xem cho định dạng này">Tải xuống hoặc mở bằng code trong runtime.</Empty>}
      </div>
    </div>
  );
}
