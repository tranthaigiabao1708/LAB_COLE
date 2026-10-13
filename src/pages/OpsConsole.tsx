import { useEffect, useState } from 'react';
import {
  Cable, Cpu, Database, FileStack, HardDrive, KeyRound, LayoutTemplate, Lock, ScrollText, Settings2, ShieldCheck, Users, AlertTriangle,
} from 'lucide-react';
import { CLASSES, DOMAINS, PROJECTS } from '../adapters/catalog';
import { TEMPLATES } from '../adapters/templates';
import { storage, storageEstimate } from '../adapters/storage';
import { DemoBadge } from '../components/ui';
import { fmtBytes } from '../lib/format';

type Section = 'users' | 'content' | 'templates' | 'runtimes' | 'connections' | 'storage' | 'config' | 'audit';
const NAV: { id: Section; label: string; icon: typeof Users }[] = [
  { id: 'users', label: 'Người dùng & lớp', icon: Users },
  { id: 'content', label: 'Domain, docs, dataset', icon: FileStack },
  { id: 'templates', label: 'Workspace templates', icon: LayoutTemplate },
  { id: 'runtimes', label: 'Runtime & quota', icon: Cpu },
  { id: 'connections', label: 'Kết nối dịch vụ', icon: Cable },
  { id: 'storage', label: 'Lưu trữ & chính sách', icon: HardDrive },
  { id: 'config', label: 'Cấu hình', icon: Settings2 },
  { id: 'audit', label: 'Audit & lỗi', icon: ScrollText },
];

const NEEDS_BACKEND = 'Cần backend quản trị (chưa có trong prototype)';

export default function OpsConsole() {
  const [s, setS] = useState<Section>('runtimes');
  useEffect(() => { document.title = 'Vận hành · AI Lab Platform'; }, []);
  return (
    <div className="console">
      <nav className="console-nav" aria-label="Operations">
        <div className="upper" style={{ padding: '4px 10px 8px' }}>Vận hành</div>
        {NAV.map((n) => <button key={n.id} id={`ops-nav-${n.id}`} className={s === n.id ? 'on' : ''} onClick={() => setS(n.id)}><n.icon size={14} />{n.label}</button>)}
        <div className="grow" />
        <div className="callout xs" style={{ margin: 6 }}><ShieldCheck size={13} /><div>Quyền quản trị hệ thống <b>tách biệt</b> với quyền đọc nội dung workspace. Admin quản lý tài nguyên, không mặc định đọc code/dữ liệu của học viên.</div></div>
      </nav>
      <div className="console-main">
        <div className="page-inner">
          <div className="page-head">
            <div><h1>{NAV.find((n) => n.id === s)?.label}</h1><p>Bảng điều khiển vận hành. Số liệu minh hoạ trừ khi ghi chú “đo thật”.</p></div>
            <div className="grow" /><DemoBadge label="Ops demo · read-only" />
          </div>
          {s === 'users' && <Users_ />}
          {s === 'content' && <Content />}
          {s === 'templates' && <Templates />}
          {s === 'runtimes' && <Runtimes />}
          {s === 'connections' && <Connections />}
          {s === 'storage' && <StorageSec />}
          {s === 'config' && <Config />}
          {s === 'audit' && <Audit />}
        </div>
      </div>
    </div>
  );
}

function Locked({ label = 'Thêm' }: { label?: string }) {
  return <button className="btn sm" disabled title={NEEDS_BACKEND}><Lock size={11} />{label}</button>;
}
function Tile({ k, v, sub }: { k: string; v: string | number; sub?: string }) {
  return <div className="metric-tile"><span className="v">{v}</span><span className="k">{k}</span>{sub && <span className="xs dim">{sub}</span>}</div>;
}

function Users_() {
  return (
    <section className="card">
      <div className="card-h"><h2>Lớp học</h2><div className="grow" /><Locked label="Tạo lớp" /><Locked label="Import CSV" /></div>
      <table className="list-table">
        <thead><tr><th>Lớp</th><th>Kỳ</th><th>Giáo viên</th><th>Học viên</th><th>Projects</th><th>Runtime profile</th><th>Storage quota / HV</th></tr></thead>
        <tbody>{CLASSES.map((c) => <tr key={c.id}><td className="small strong">{c.name}</td><td className="xs">{c.term}</td><td className="xs">{c.teacher}</td><td className="num xs">{c.students}</td><td className="num xs">{PROJECTS.filter((p) => p.classId === c.id).length}</td><td className="mono xs">cpu-small · 2 GB</td><td className="num xs">5 GB</td></tr>)}</tbody>
      </table>
      <div className="card-b xs dim">Vai trò: student · teacher · ops-admin · content-editor. Phân quyền thực thi ở API gateway (RBAC + quyền theo workspace), không dựa vào việc ẩn nút trên UI.</div>
    </section>
  );
}

function Content() {
  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-h"><h2>Domains</h2><div className="grow" /><Locked /></div>
        <table className="list-table"><thead><tr><th>Domain</th><th>Mô tả</th><th>Projects</th></tr></thead>
          <tbody>{DOMAINS.map((d) => <tr key={d.id}><td><span className="row"><span className="dot" style={{ background: d.color }} />{d.name}</span></td><td className="xs muted">{d.description}</td><td className="num xs">{PROJECTS.filter((p) => p.domainId === d.id).length}</td></tr>)}</tbody></table>
      </section>
      <section className="card">
        <div className="card-h"><h2>Dataset catalog</h2><div className="grow" /><Locked label="Upload" /></div>
        <table className="list-table"><thead><tr><th>Dataset</th><th>Template</th><th>Nguồn</th><th>PII</th></tr></thead>
          <tbody>
            <tr><td className="mono xs">orders.csv / customers.csv</td><td className="xs">ecom-churn</td><td className="xs">synthetic (seeded)</td><td><span className="badge green">none</span></td></tr>
            <tr><td className="mono xs">transactions.csv</td><td className="xs">bank-fraud</td><td className="xs">synthetic (seeded)</td><td><span className="badge green">none</span></td></tr>
            <tr><td className="mono xs">admissions.csv</td><td className="xs">health-readmit</td><td className="xs">synthetic (seeded)</td><td><span className="badge green">none</span></td></tr>
            <tr><td className="mono xs">cole_labs_warehouse</td><td className="xs">—</td><td className="xs">PostgreSQL (read-only)</td><td><span className="badge amber">review</span></td></tr>
          </tbody></table>
        <div className="card-b xs dim">Labs/docs là gợi ý, không phải quy trình bắt buộc. Nội dung được version hoá; workspace đã tạo không bị thay đổi khi template cập nhật.</div>
      </section>
    </div>
  );
}

function Templates() {
  return (
    <section className="card">
      <div className="card-h"><h2>Workspace templates</h2><span className="badge green">dữ liệu thật từ code</span><div className="grow" /><Locked label="Template mới" /></div>
      <table className="list-table">
        <thead><tr><th>ID</th><th>Tên</th><th>Stack</th><th>Labs/docs</th><th>Files</th><th>Dùng bởi</th></tr></thead>
        <tbody>{TEMPLATES.map((t) => <tr key={t.id}><td className="mono xs">{t.id}</td><td className="small">{t.name}<div className="xs dim">{t.description}</div></td><td className="mono xs">{t.stack.join(', ')}</td><td className="num xs">{t.labs.length}</td><td className="num xs">{t.build().length}</td><td className="xs">{PROJECTS.filter((p) => p.templateId === t.id).map((p) => p.name).join(', ') || '—'}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function Runtimes() {
  const rows = [
    { id: 'cpu-small', img: 'python-3.12-ds:2026.09', cpu: '1 vCPU', mem: '2 GB', gpu: '—', idle: '30 phút', active: 41, cap: 120 },
    { id: 'cpu-large', img: 'python-3.12-ds:2026.09', cpu: '4 vCPU', mem: '8 GB', gpu: '—', idle: '20 phút', active: 6, cap: 30 },
    { id: 'gpu-t4', img: 'python-3.12-torch-cu12:2026.09', cpu: '4 vCPU', mem: '16 GB', gpu: '1× T4', idle: '10 phút', active: 2, cap: 8 },
  ];
  return (
    <>
      <div className="grid-4">
        <Tile k="Runtime đang chạy" v="49" sub="demo" />
        <Tile k="Đang khởi tạo" v="3" sub="p95 cold start 18 s · demo" />
        <Tile k="Lỗi 24h" v="7" sub="OOMKilled: 5 · image pull: 2 · demo" />
        <Tile k="GPU sử dụng" v="2 / 8" sub="demo" />
      </div>
      <section className="card">
        <div className="card-h"><h2>Runtime profiles</h2><div className="grow" /><Locked label="Profile mới" /></div>
        <table className="list-table">
          <thead><tr><th>Profile</th><th>Image</th><th>CPU</th><th>RAM</th><th>GPU</th><th>Idle stop</th><th>Đang chạy / Giới hạn</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td className="mono xs">{r.id}</td><td className="mono xs">{r.img}</td><td className="xs">{r.cpu}</td><td className="xs">{r.mem}</td><td className="xs">{r.gpu}</td><td className="xs">{r.idle}</td><td><div className="row"><div className="meter" style={{ width: 120 }}><div style={{ width: `${(r.active / r.cap) * 100}%` }} /></div><span className="num xs">{r.active}/{r.cap}</span></div></td></tr>)}</tbody>
        </table>
        <div className="card-b xs dim">Mỗi workspace chạy trong container riêng (namespace + cgroup + network policy chặn metadata/internal endpoints). Idle-stop chỉ huỷ runtime; storage workspace không bị ảnh hưởng.</div>
      </section>
      <div className="callout teal xs"><Cpu size={14} /><div>Prototype hiện tại dùng Pyodide trong Web Worker của trình duyệt cho từng tab: đã cô lập theo phiên nhưng không có quota CPU/GPU thật.</div></div>
    </>
  );
}

function Connections() {
  const rows = [
    { name: 'PostgreSQL · cole_labs_warehouse', kind: 'database', scope: 'read-only · per class', status: 'Not configured' },
    { name: 'Vector DB (pgvector)', kind: 'vector', scope: 'namespace per workspace', status: 'Planned' },
    { name: 'Object storage (S3/GCS)', kind: 'storage', scope: 'prefix per workspace', status: 'Planned' },
    { name: 'LLM gateway (Gemini/OpenAI)', kind: 'llm', scope: 'quota per student · keys in vault', status: 'Planned' },
  ];
  return (
    <section className="card">
      <div className="card-h"><h2>Kết nối dịch vụ</h2><div className="grow" /><Locked label="Kết nối mới" /></div>
      <table className="list-table"><thead><tr><th>Dịch vụ</th><th>Loại</th><th>Phạm vi</th><th>Secret</th><th>Trạng thái</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name}><td className="small">{r.name}</td><td className="xs"><span className="badge outline">{r.kind}</span></td><td className="xs muted">{r.scope}</td><td className="mono xs dim"><KeyRound size={11} /> ••••••••</td><td><span className="badge outline">{r.status}</span></td></tr>)}</tbody></table>
      <div className="card-b xs dim">Secrets nằm trong vault phía backend và được inject vào runtime dưới dạng biến môi trường ngắn hạn. Không bao giờ hiển thị giá trị, không lưu trên trình duyệt, không ghi vào log.</div>
    </section>
  );
}

function StorageSec() {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [ws, setWs] = useState<{ n: number; bytes: number }>({ n: 0, bytes: 0 });
  useEffect(() => {
    void storageEstimate().then(setEst);
    void (async () => { const l = await storage.listWorkspaces(); let b = 0; for (const w of l) b += Object.values(await storage.listFiles(w.id)).reduce((s, f) => s + f.size, 0); setWs({ n: l.length, bytes: b }); })();
  }, []);
  return (
    <>
      <div className="grid-4">
        <Tile k="Workspaces trên máy này" v={ws.n} sub="đo thật" />
        <Tile k="Dung lượng files" v={fmtBytes(ws.bytes)} sub="đo thật" />
        <Tile k="IndexedDB usage" v={est ? fmtBytes(est.usage) : '—'} sub={est ? `quota ${fmtBytes(est.quota)} · đo thật` : ''} />
        <Tile k="Tổng storage nền tảng" v="1.8 TB" sub="demo" />
      </div>
      <section className="card">
        <div className="card-h"><h2>Chính sách lưu trữ</h2><div className="grow" /><Locked label="Sửa" /></div>
        <table className="list-table"><thead><tr><th>Đối tượng</th><th>Nơi lưu (production)</th><th>Retention</th><th>Versioning</th><th>Backup</th></tr></thead>
          <tbody>
            <tr><td className="small">Files, notebooks, source</td><td className="xs mono">s3://lab/{'{ws}'}/files</td><td className="xs">hết khoá + 180 ngày</td><td className="xs">object versioning</td><td className="xs">daily</td></tr>
            <tr><td className="small">Artifacts (dataset, model)</td><td className="xs mono">s3://lab/{'{ws}'}/artifacts</td><td className="xs">hết khoá + 180 ngày</td><td className="xs">immutable per version</td><td className="xs">daily</td></tr>
            <tr><td className="small">Metadata (runs, lineage, notes)</td><td className="xs mono">PostgreSQL</td><td className="xs">vĩnh viễn trong khoá</td><td className="xs">audit table</td><td className="xs">PITR</td></tr>
            <tr><td className="small">Runtime scratch / memory</td><td className="xs mono">container ephemeral</td><td className="xs">tới khi runtime dừng</td><td className="xs">—</td><td className="xs">không</td></tr>
          </tbody></table>
      </section>
    </>
  );
}

function Config() {
  const rows = [
    ['Autosave debounce', '900 ms', 'đang dùng'], ['Đồng bộ file từ runtime (giới hạn)', '25 MB / file', 'đang dùng'], ['Lịch sử runs giữ lại / workspace', '300', 'đang dùng'],
    ['Upload tối đa (prototype)', '50 MB', 'đang dùng'], ['Data viewer page size', '50 hàng', 'đang dùng'], ['Idle stop runtime', '30 phút', 'demo'],
  ];
  return (
    <section className="card">
      <div className="card-h"><h2>Cấu hình nền tảng</h2><div className="grow" /><Locked label="Sửa" /></div>
      <table className="list-table"><thead><tr><th>Khoá</th><th>Giá trị</th><th>Nguồn</th></tr></thead>
        <tbody>{rows.map(([k, v, s]) => <tr key={k}><td className="small">{k}</td><td className="mono xs">{v}</td><td>{s === 'demo' ? <span className="badge demo">demo</span> : <span className="badge green">{s}</span>}</td></tr>)}</tbody></table>
    </section>
  );
}

function Audit() {
  const rows = [
    ['10:42', 'runtime', 'warn', 'ws-7f2a… OOMKilled (cpu-small, 2 GB) · tự động đánh dấu error, storage không bị ảnh hưởng'],
    ['10:31', 'auth', 'info', 'teacher t-minh xem workspace ws-91c0… (được chia sẻ)'],
    ['09:58', 'storage', 'info', 'Quota warning: s2 đạt 82% storage quota'],
    ['09:12', 'connections', 'error', 'cole_labs_warehouse: connection refused (chưa cấu hình)'],
  ];
  return (
    <section className="card">
      <div className="card-h"><h2>Audit log &amp; lỗi</h2><DemoBadge /></div>
      <table className="list-table"><thead><tr><th>Time</th><th>Service</th><th>Level</th><th>Event</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td className="num xs">{r[0]}</td><td className="xs"><span className="badge outline">{r[1]}</span></td><td>{r[2] === 'error' ? <span className="badge red">error</span> : r[2] === 'warn' ? <span className="badge amber"><AlertTriangle size={10} />warn</span> : <span className="badge">info</span>}</td><td className="xs">{r[3]}</td></tr>)}</tbody></table>
      <div className="card-b xs dim row gap-4"><Database size={12} />Audit ghi lại truy cập nội dung (ai xem workspace nào) để đảm bảo tách biệt quyền quản trị và quyền nội dung.</div>
    </section>
  );
}
