import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, Boxes, Cpu, FolderKanban, Globe2, Layers, Loader2, Plus, Users, HardDrive } from 'lucide-react';
import { CLASSES, DOMAINS, PROJECTS, ensureWorkspace } from '../adapters/catalog';
import { templateById } from '../adapters/templates';
import { storage } from '../adapters/storage';
import { DemoBadge } from '../components/ui';
import { relTime } from '../lib/format';
import type { WorkspaceMeta } from '../lib/types';

const CONCEPTS = [
  { icon: Globe2, name: 'Domain', text: 'Ngữ cảnh nghiệp vụ: Banking, E-commerce, Healthcare.' },
  { icon: FolderKanban, name: 'Project', text: 'Sản phẩm/mục tiêu bạn đang xây dựng.' },
  { icon: Layers, name: 'Workspace', text: 'Môi trường làm việc bền vững của project: files, notes, runs.' },
  { icon: BookOpen, name: 'Lab', text: 'Tài liệu/gợi ý thực hành gắn với project. Không bắt buộc thứ tự.' },
  { icon: Cpu, name: 'Runtime', text: 'Phiên thực thi code tạm thời, cô lập. Dừng ≠ mất dữ liệu.' },
  { icon: Boxes, name: 'Artifact', text: 'Thành phẩm đã lưu: dataset, model, metrics, chart… có version.' },
];

export default function Catalog() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const classId = params.get('class') ?? 'all';
  const domainId = params.get('domain') ?? 'all';
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { document.title = 'Lớp & dự án · AI Lab Platform'; void storage.listWorkspaces().then(setWorkspaces); }, []);

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v === 'all') p.delete(k); else p.set(k, v); setParams(p, { replace: true }); };
  const projects = PROJECTS.filter((p) => (classId === 'all' || p.classId === classId) && (domainId === 'all' || p.domainId === domainId));
  const open = async (id: string) => { setBusy(id); try { const ws = await ensureWorkspace(id); nav(`/w/${ws.id}`); } finally { setBusy(null); } };

  return (
    <div className="page-inner">
      <div className="page-head">
        <div><h1>Lớp &amp; dự án</h1><p>Chọn lớp → domain → project. Mỗi project có đúng một workspace bền vững để dữ liệu không bị chia cắt giữa các buổi học.</p></div>
        <div className="grow" />
        <DemoBadge label="Catalog demo" />
      </div>

      <div className="concepts" aria-label="Khái niệm">
        {CONCEPTS.map((c) => <div key={c.name} className="concept"><b><c.icon size={13} className="t-accent" />{c.name}</b>{c.text}</div>)}
      </div>

      <div className="catalog">
        <section className="card">
          <div className="card-h"><Users size={14} className="t-accent" /><h3>1 · Lớp</h3></div>
          <div className="pick">
            <button className={classId === 'all' ? 'on' : ''} onClick={() => set('class', 'all')} id="class-all"><span className="small strong">Tất cả lớp</span></button>
            {CLASSES.map((c) => (
              <button key={c.id} id={`class-${c.id}`} className={classId === c.id ? 'on' : ''} onClick={() => set('class', c.id)}>
                <span className="small strong">{c.name}</span>
                <span className="xs dim">{c.teacher} · {c.term}</span>
                <span className="xs dim">{c.schedule} · {c.students} học viên</span>
              </button>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-h"><Globe2 size={14} className="t-accent" /><h3>2 · Domain</h3></div>
          <div className="pick">
            <button className={domainId === 'all' ? 'on' : ''} onClick={() => set('domain', 'all')} id="domain-all"><span className="small strong">Tất cả domain</span></button>
            {DOMAINS.map((d) => (
              <button key={d.id} id={`domain-${d.id}`} className={domainId === d.id ? 'on' : ''} onClick={() => set('domain', d.id)}>
                <span className="small strong row gap-4"><span className="dot" style={{ background: d.color }} />{d.name}</span>
                <span className="xs dim">{d.description}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="col gap-12">
          <div className="row"><h3 style={{ margin: 0, fontSize: 'var(--fs-md)' }}>3 · Project</h3><span className="xs dim">{projects.length} dự án</span></div>
          {projects.length === 0 && <div className="card card-b xs dim">Không có dự án cho bộ lọc này.</div>}
          <div className="grid-2">
            {projects.map((p) => {
              const ws = workspaces.find((w) => w.projectId === p.id);
              const tpl = templateById(p.templateId);
              const d = DOMAINS.find((x) => x.id === p.domainId);
              return (
                <article key={p.id} className="proj-card" id={`project-${p.id}`}>
                  <div className="row"><span className="badge" style={{ color: d?.color }}>{d?.name}</span><span className="xs dim">{p.level}</span><div className="grow" />{ws ? <span className="badge green">Workspace có sẵn</span> : <span className="badge outline">Chưa tạo</span>}</div>
                  <h3>{p.name}</h3>
                  <div className="small muted">{p.summary}</div>
                  <div className="row wrap gap-4">{p.tags.map((t) => <span key={t} className="badge outline">{t}</span>)}</div>
                  <dl className="kv xs">
                    <dt>Template</dt><dd>{tpl?.name}</dd>
                    <dt>Stack</dt><dd className="mono">{tpl?.stack.join(', ')}</dd>
                    <dt>Labs/Docs</dt><dd>{tpl?.labs.length ?? 0} tài liệu gợi ý</dd>
                    {ws && <><dt>Workspace</dt><dd className="row gap-4"><HardDrive size={11} className="t-teal" /><span className="mono">{ws.id}</span><span className="dim">· mở {relTime(ws.lastOpenedAt)}</span></dd></>}
                  </dl>
                  <div className="row">
                    <div className="grow" />
                    <button className={`btn ${ws ? 'primary' : ''}`} id={`open-${p.id}`} disabled={busy === p.id} onClick={() => void open(p.id)}>
                      {busy === p.id ? <Loader2 size={13} className="spin" /> : ws ? <ArrowRight size={13} /> : <Plus size={13} />}
                      {ws ? 'Tiếp tục workspace' : 'Tạo workspace'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="callout xs"><Layers size={14} /><div>Tạo workspace sẽ sao chép template (dataset synthetic, notebook mẫu, docs) vào storage của bạn. Từ đó bạn toàn quyền sửa, xoá, thêm file; template gốc không bị thay đổi.</div></div>
        </section>
      </div>
    </div>
  );
}
