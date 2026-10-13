import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

/* ---------------- prompt / confirm dialogs ---------------- */
interface DialogReq {
  kind: 'prompt' | 'confirm';
  title: string;
  message?: string;
  label?: string;
  defaultValue?: string;
  confirmText?: string;
  danger?: boolean;
  validate?: (v: string) => string | null;
  resolve: (v: string | null) => void;
}
const useDialog = create<{ req: DialogReq | null; set: (r: DialogReq | null) => void }>()((set) => ({ req: null, set: (req) => set({ req }) }));

export function promptDialog(o: Omit<DialogReq, 'kind' | 'resolve'>) {
  return new Promise<string | null>((resolve) => useDialog.getState().set({ ...o, kind: 'prompt', resolve }));
}
export function confirmDialog(o: Omit<DialogReq, 'kind' | 'resolve' | 'label' | 'defaultValue'>) {
  return new Promise<boolean>((resolve) => useDialog.getState().set({ ...o, kind: 'confirm', resolve: (v) => resolve(v !== null) }));
}

export function DialogHost() {
  const { req, set } = useDialog();
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (req) { setValue(req.defaultValue ?? ''); setTimeout(() => ref.current?.select(), 30); }
  }, [req]);
  if (!req) return null;
  const err = req.kind === 'prompt' && req.validate ? req.validate(value) : null;
  const done = (v: string | null) => { req.resolve(v); set(null); };
  return (
    <div className="overlay" onMouseDown={() => done(null)}>
      <form className="modal fade-in" onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (!err) done(req.kind === 'prompt' ? value : 'ok'); }}>
        <div className="modal-h">{req.title}</div>
        <div className="modal-b">
          {req.message && <div className="muted small">{req.message}</div>}
          {req.kind === 'prompt' && (
            <label className="field">
              {req.label}
              <input ref={ref} className="input mono" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && done(null)} />
              {err && value && <span className="t-red xs">{err}</span>}
            </label>
          )}
        </div>
        <div className="modal-f">
          <button type="button" className="btn ghost" onClick={() => done(null)}>Huỷ</button>
          <button type="submit" className={`btn ${req.danger ? 'danger' : 'primary'}`} disabled={!!err} autoFocus={req.kind === 'confirm'}>{req.confirmText ?? 'OK'}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- toasts ---------------- */
type ToastTone = 'info' | 'success' | 'warn' | 'error';
interface Toast { id: number; tone: ToastTone; text: string }
const useToasts = create<{ list: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>()((set) => ({
  list: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ list: [...s.list.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ list: s.list.filter((x) => x.id !== id) })), 4200);
  },
  drop: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
}));
export const toast = (text: string, tone: ToastTone = 'info') => useToasts.getState().push({ text, tone });

export function ToastHost() {
  const { list, drop } = useToasts();
  return (
    <div className="toast-stack" role="status">
      {list.map((t) => (
        <div key={t.id} className="toast" onClick={() => drop(t.id)}>
          {t.tone === 'success' ? <CheckCircle2 size={16} className="t-green" /> : t.tone === 'error' ? <XCircle size={16} className="t-red" /> : t.tone === 'warn' ? <AlertTriangle size={16} className="t-amber" /> : <Info size={16} className="t-accent" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
