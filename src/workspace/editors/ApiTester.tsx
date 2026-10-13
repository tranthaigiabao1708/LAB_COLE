import { useEffect, useState } from 'react';
import { Globe, Send, Loader2, Plus, Trash2, KeyRound, History, ShieldAlert } from 'lucide-react';
import { useWs } from '../../state/workspace';
import { storage } from '../../adapters/storage';
import { Empty } from '../../components/ui';
import { fmtBytes, fmtDuration, fmtTime } from '../../lib/format';

interface Hdr { k: string; v: string }
interface Resp { status: number; statusText: string; ms: number; size: number; headers: [string, string][]; body: string; error?: string }
interface Hist { at: number; method: string; url: string; status: number | null; ms: number }
const SENSITIVE = /authorization|api[-_]?key|token|secret|cookie|password/i;

export default function ApiTester() {
  const ws = useWs((s) => s.ws)!;
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('https://httpbin.org/json');
  const [headers, setHeaders] = useState<Hdr[]>([{ k: 'Accept', v: 'application/json' }]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<Resp | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [view, setView] = useState<'body' | 'headers'>('body');
  const key = `api-history:${ws.id}`;
  useEffect(() => { void storage.getKV<Hist[]>(key).then((h) => setHist(h ?? [])); }, [key]);

  const send = async () => {
    let u: URL;
    try { u = new URL(url); } catch { setResp({ status: 0, statusText: '', ms: 0, size: 0, headers: [], body: '', error: 'URL không hợp lệ' }); return; }
    if (!/^https?:$/.test(u.protocol)) { setResp({ status: 0, statusText: '', ms: 0, size: 0, headers: [], body: '', error: 'Chỉ hỗ trợ http/https' }); return; }
    setBusy(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const t0 = performance.now();
    let entry: Hist = { at: Date.now(), method, url: u.origin + u.pathname, status: null, ms: 0 };
    try {
      const h = new Headers();
      headers.filter((x) => x.k.trim()).forEach((x) => h.set(x.k.trim(), x.v));
      const r = await fetch(u, { method, headers: h, body: ['GET', 'HEAD'].includes(method) ? undefined : body, signal: ctrl.signal });
      const text = await r.text();
      const ms = Math.round(performance.now() - t0);
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON */ }
      setResp({ status: r.status, statusText: r.statusText, ms, size: new Blob([text]).size, headers: [...r.headers.entries()], body: pretty });
      entry = { ...entry, status: r.status, ms };
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      const msg = (e as Error).name === 'AbortError' ? 'Timeout sau 20s' : `${(e as Error).message}. Có thể do CORS: trình duyệt chặn khi server không cho phép origin này. Production sẽ gửi request qua proxy phía backend.`;
      setResp({ status: 0, statusText: '', ms, size: 0, headers: [], body: '', error: msg });
      entry = { ...entry, ms };
    } finally {
      clearTimeout(timer);
      setBusy(false);
      // History never stores header values or bodies (may contain secrets) and strips query strings.
      const next = [entry, ...hist].slice(0, 30);
      setHist(next);
      void storage.setKV(key, next);
    }
  };

  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="toolbar" style={{ height: 46 }}>
        <Globe size={15} className="t-accent" />
        <select className="select mono" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="HTTP method">{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((m) => <option key={m}>{m}</option>)}</select>
        <input className="input mono grow" id="api-url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void send()} aria-label="Request URL" />
        <button className="btn primary sm" id="api-send" disabled={busy} onClick={() => void send()}>{busy ? <Loader2 size={13} className="spin" /> : <Send size={13} />}Send</button>
      </div>
      <div className="grow" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1.4fr)', minHeight: 0 }}>
        <div className="scroll" style={{ borderRight: '1px solid var(--line)' }}>
          <div className="group-h">Headers</div>
          <div className="col p-8" style={{ gap: 6 }}>
            {headers.map((h, i) => {
              const sens = SENSITIVE.test(h.k);
              return (
                <div key={i} className="row gap-4">
                  <input className="input mono" style={{ width: 140 }} value={h.k} placeholder="Header" onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
                  <input className="input mono grow" type={sens ? 'password' : 'text'} autoComplete="off" value={h.v} placeholder="value" onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
                  {sens && <KeyRound size={13} className="t-amber" aria-label="Sensitive: masked and never stored" />}
                  <button className="icon-btn sm" onClick={() => setHeaders(headers.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
                </div>
              );
            })}
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setHeaders([...headers, { k: '', v: '' }])}><Plus size={12} />Header</button>
          </div>
          {!['GET', 'HEAD'].includes(method) && <>
            <div className="group-h">Body</div>
            <div className="p-8"><textarea className="textarea mono" rows={8} style={{ width: '100%' }} value={body} onChange={(e) => setBody(e.target.value)} placeholder='{"customer_id": "C0001"}' /></div>
          </>}
          <div className="p-8"><div className="callout xs"><ShieldAlert size={14} /><div>Giá trị header nhạy cảm bị che, chỉ tồn tại trong bộ nhớ tab này. Lịch sử chỉ lưu method, origin + path, status và thời gian; không lưu query string, header hay body.</div></div></div>
          <div className="group-h"><History size={11} />History</div>
          {hist.length === 0 && <div className="p-12 xs dim">Chưa có request.</div>}
          {hist.map((h, i) => (
            <div key={i} className="list-item" onClick={() => { setMethod(h.method); setUrl(h.url); }}>
              <span className="mono xs strong" style={{ width: 44 }}>{h.method}</span>
              <div className="li-main"><span className="mono xs ellipsis">{h.url}</span><span className="xs dim">{fmtTime(h.at)} · {fmtDuration(h.ms)}</span></div>
              <span className={`badge ${h.status && h.status < 400 ? 'green' : 'red'}`}>{h.status ?? 'ERR'}</span>
            </div>
          ))}
        </div>
        <div className="col" style={{ gap: 0, minHeight: 0 }}>
          {resp ? (
            <>
              <div className="toolbar">
                {resp.error ? <span className="badge red">network error</span> : <span className={`badge ${resp.status < 300 ? 'green' : resp.status < 400 ? 'amber' : 'red'}`}>{resp.status} {resp.statusText}</span>}
                <span className="num xs muted">{fmtDuration(resp.ms)} · {fmtBytes(resp.size)}</span>
                <div className="grow" />
                <div className="seg"><button className={view === 'body' ? 'on' : ''} onClick={() => setView('body')}>Body</button><button className={view === 'headers' ? 'on' : ''} onClick={() => setView('headers')}>Headers ({resp.headers.length})</button></div>
              </div>
              <div className="grow scroll">
                {resp.error ? <div className="p-12"><div className="callout red xs">{resp.error}</div></div>
                  : view === 'body' ? <pre className="stream p-12">{resp.body || '(empty body)'}</pre>
                  : <table className="list-table"><tbody>{resp.headers.map(([k, v]) => <tr key={k}><td className="mono xs">{k}</td><td className="mono xs">{v}</td></tr>)}</tbody></table>}
              </div>
            </>
          ) : <Empty icon={<Globe size={26} />} title="Gửi một request">Request HTTP thật được gửi từ trình duyệt. Dùng để kiểm thử API bạn dựng hoặc API công khai có CORS.</Empty>}
        </div>
      </div>
    </div>
  );
}
