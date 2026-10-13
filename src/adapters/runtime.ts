/**
 * RuntimeAdapter — isolated code execution.
 *
 * Prototype: Pyodide (CPython/WASM) in a dedicated Web Worker (public/runtime-worker.js).
 * One RuntimeClient == one runtime session bound to one workspace. Stopping the runtime
 * terminates the worker: in-memory state is lost, persisted files are untouched.
 *
 * Production: same interface backed by a per-workspace kernel/container
 * (e.g. Jupyter Kernel Gateway over WebSocket).
 */
import type { DataTarget, ExecError, FileEncoding, ProfileResult, ResultPayload, RuntimeStatus, RuntimeVar, DataFramePayload } from '../lib/types';

export interface RuntimeInfo {
  sessionId: string;
  engine: string;
  pyodideVersion?: string;
  python?: string;
  packages: string[];
  heapMB: number | null;
  startedAt?: number;
}

export interface ExecRequest {
  code: string;
  filename: string;
  runId: string;
  onStream?: (name: 'stdout' | 'stderr' | 'system', text: string) => void;
}

export interface ExecResponse {
  execCount: number;
  result: ResultPayload | null;
  error: ExecError | null;
  figures: string[];
  inputs: string[];
  /** Files read by earlier executions in this session (inferred context, not captured I/O). */
  sessionInputs?: string[];
  outputs: string[];
  deleted: string[];
  workspaceModules: string[];
  changedFiles: { path: string; size: number; encoding?: FileEncoding; content?: string; tooLarge?: boolean }[];
  heapMB: number | null;
  packages: string[];
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onStream?: ExecRequest['onStream'] };

export class RuntimeClient {
  readonly engine = 'pyodide-browser-worker';
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();
  status: RuntimeStatus = 'stopped';
  info: RuntimeInfo = { sessionId: '', engine: this.engine, packages: [], heapMB: null };
  onStatus: (status: RuntimeStatus, message?: string) => void = () => {};

  private setStatus(s: RuntimeStatus, message?: string) {
    this.status = s;
    this.onStatus(s, message);
  }

  async start(files: { path: string; content: string; encoding: FileEncoding }[]) {
    if (this.worker) return this.info;
    const sessionId = 'rt-' + Math.random().toString(36).slice(2, 8);
    this.info = { sessionId, engine: this.engine, packages: [], heapMB: null };
    this.setStatus('starting', 'Starting worker…');
    const w = new Worker('/runtime-worker.js');
    this.worker = w;
    w.onmessage = (ev) => this.handle(ev.data);
    w.onerror = (ev) => {
      this.failAll(new Error(ev.message || 'Runtime worker crashed'));
      this.worker?.terminate();
      this.worker = null;
      this.setStatus('error', ev.message || 'Runtime worker crashed');
    };
    try {
      const res = (await this.send({ type: 'init', files })) as Omit<RuntimeInfo, 'sessionId' | 'engine'>;
      this.info = { ...this.info, ...res, startedAt: Date.now() };
      this.setStatus('running');
      return this.info;
    } catch (e) {
      w.terminate();
      this.worker = null;
      this.setStatus('error', (e as Error).message);
      throw e;
    }
  }

  stop() {
    this.worker?.terminate();
    this.worker = null;
    this.failAll(new Error('Runtime stopped — execution cancelled'));
    this.queue = Promise.resolve();
    this.info = { ...this.info, heapMB: null };
    this.setStatus('stopped');
  }

  get alive() { return !!this.worker && (this.status === 'running' || this.status === 'busy' || this.status === 'restart-required'); }

  markRestartRequired(reason: string) {
    if (this.alive) this.setStatus('restart-required', reason);
  }

  private failAll(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private handle(msg: { type: string; id?: string; ok?: boolean; data?: unknown; error?: string; phase?: string; name?: string; text?: string }) {
    if (msg.type === 'status') { this.onStatus(this.status, msg.phase); return; }
    if (msg.type === 'stream' && msg.id) {
      this.pending.get(msg.id)?.onStream?.(msg.name as 'stdout', msg.text ?? '');
      return;
    }
    if (msg.type === 'reply' && msg.id) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.data); else p.reject(new Error(msg.error));
    }
  }

  private send(msg: Record<string, unknown>, onStream?: ExecRequest['onStream']) {
    if (!this.worker) return Promise.reject(new Error('Runtime is not running'));
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onStream });
      this.worker!.postMessage({ ...msg, id });
    });
  }

  /** Serialize requests that touch interpreter state. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  exec(req: ExecRequest): Promise<ExecResponse> {
    return this.enqueue(async () => {
      const prev = this.status;
      this.setStatus('busy');
      try {
        const res = (await this.send({ type: 'exec', code: req.code, filename: req.filename, runId: req.runId }, req.onStream)) as ExecResponse;
        this.info = { ...this.info, heapMB: res.heapMB, packages: res.packages };
        return res;
      } finally {
        if (this.worker) this.setStatus(prev === 'restart-required' ? 'restart-required' : 'running');
      }
    });
  }

  profile(target: DataTarget & { page?: number; pageSize?: number; profile?: boolean; query?: string }) {
    return this.enqueue(() => this.send({ type: 'profile', target }) as Promise<ProfileResult>);
  }
  vars() { return this.enqueue(() => this.send({ type: 'vars' }) as Promise<RuntimeVar[]>); }
  sqlTables() { return this.enqueue(() => this.send({ type: 'sqlTables' }) as Promise<{ table: string; path: string }[]>); }
  sql(query: string) { return this.enqueue(() => this.send({ type: 'sql', query }) as Promise<DataFramePayload>); }
  writeFile(path: string, content: string, encoding: FileEncoding) {
    if (!this.worker) return Promise.resolve(false);
    return this.send({ type: 'writeFile', path, content, encoding });
  }
  deleteFile(path: string) {
    if (!this.worker) return Promise.resolve(false);
    return this.send({ type: 'deleteFile', path });
  }
}
