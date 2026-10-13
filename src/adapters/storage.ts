/**
 * StorageAdapter — persistent workspace storage, independent from runtime lifecycle.
 *
 * Prototype implementation: IndexedDB in this browser profile ("browser-indexeddb").
 * Production implementation: object storage (S3/GCS) for file blobs +
 * PostgreSQL for metadata (artifacts, runs, notes, lineage), behind an authenticated API.
 * The UI only depends on this interface.
 */
import { createStore, get, set, del, keys } from 'idb-keyval';
import type {
  Artifact, FileMeta, ManualEdge, Note, RunRecord, WorkspaceMeta, WsFile,
} from '../lib/types';

export interface StorageAdapter {
  readonly backend: string;
  uri(workspaceId: string, path: string): string;
  listWorkspaces(): Promise<WorkspaceMeta[]>;
  saveWorkspace(ws: WorkspaceMeta): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  listFiles(wsId: string): Promise<Record<string, FileMeta>>;
  readFile(wsId: string, path: string): Promise<string | undefined>;
  writeFile(wsId: string, file: WsFile): Promise<FileMeta>;
  deleteFile(wsId: string, path: string): Promise<void>;
  getArtifacts(wsId: string): Promise<Artifact[]>;
  saveArtifacts(wsId: string, a: Artifact[]): Promise<void>;
  getRuns(wsId: string): Promise<RunRecord[]>;
  saveRuns(wsId: string, r: RunRecord[]): Promise<void>;
  getNotes(wsId: string): Promise<Note[]>;
  saveNotes(wsId: string, n: Note[]): Promise<void>;
  getEdges(wsId: string): Promise<ManualEdge[]>;
  saveEdges(wsId: string, e: ManualEdge[]): Promise<void>;
  getLayout<T>(wsId: string): Promise<T | undefined>;
  saveLayout<T>(wsId: string, layout: T): Promise<void>;
  getKV<T>(key: string): Promise<T | undefined>;
  setKV<T>(key: string, value: T): Promise<void>;
}

const store = createStore('ai-lab-platform', 'kv');
const k = (wsId: string, part: string) => `ws:${wsId}:${part}`;

/** Serialize writes per key so concurrent autosaves never interleave. */
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => undefined));
  return next;
}

class IndexedDbStorage implements StorageAdapter {
  readonly backend = 'browser-indexeddb';

  uri(workspaceId: string, path: string) {
    return `idb://ai-lab-platform/${workspaceId}/${path}`;
  }

  async listWorkspaces() {
    return (await get<WorkspaceMeta[]>('workspaces', store)) ?? [];
  }

  saveWorkspace(ws: WorkspaceMeta) {
    return withLock('workspaces', async () => {
      const all = (await get<WorkspaceMeta[]>('workspaces', store)) ?? [];
      const i = all.findIndex((w) => w.id === ws.id);
      if (i >= 0) all[i] = ws; else all.push(ws);
      await set('workspaces', all, store);
    });
  }

  async deleteWorkspace(id: string) {
    await withLock('workspaces', async () => {
      const all = (await get<WorkspaceMeta[]>('workspaces', store)) ?? [];
      await set('workspaces', all.filter((w) => w.id !== id), store);
    });
    const all = await keys(store);
    await Promise.all(all.filter((x) => String(x).startsWith(`ws:${id}:`)).map((x) => del(x, store)));
  }

  async listFiles(wsId: string) {
    return (await get<Record<string, FileMeta>>(k(wsId, 'index'), store)) ?? {};
  }

  readFile(wsId: string, path: string) {
    return get<string>(k(wsId, `blob:${path}`), store);
  }

  async writeFile(wsId: string, file: WsFile) {
    const { content, ...meta } = file;
    await set(k(wsId, `blob:${file.path}`), content, store);
    await withLock(k(wsId, 'index'), async () => {
      const idx = (await get<Record<string, FileMeta>>(k(wsId, 'index'), store)) ?? {};
      const prev = idx[file.path];
      idx[file.path] = { ...meta, createdAt: prev?.createdAt ?? meta.createdAt };
      await set(k(wsId, 'index'), idx, store);
    });
    return meta;
  }

  async deleteFile(wsId: string, path: string) {
    await del(k(wsId, `blob:${path}`), store);
    await withLock(k(wsId, 'index'), async () => {
      const idx = (await get<Record<string, FileMeta>>(k(wsId, 'index'), store)) ?? {};
      delete idx[path];
      await set(k(wsId, 'index'), idx, store);
    });
  }

  private async getList<T>(wsId: string, part: string) {
    return (await get<T[]>(k(wsId, part), store)) ?? [];
  }
  private setList<T>(wsId: string, part: string, v: T[]) {
    return withLock(k(wsId, part), () => set(k(wsId, part), v, store));
  }

  getArtifacts(wsId: string) { return this.getList<Artifact>(wsId, 'artifacts'); }
  saveArtifacts(wsId: string, a: Artifact[]) { return this.setList(wsId, 'artifacts', a); }
  getRuns(wsId: string) { return this.getList<RunRecord>(wsId, 'runs'); }
  saveRuns(wsId: string, r: RunRecord[]) { return this.setList(wsId, 'runs', r.slice(-300)); }
  getNotes(wsId: string) { return this.getList<Note>(wsId, 'notes'); }
  saveNotes(wsId: string, n: Note[]) { return this.setList(wsId, 'notes', n); }
  getEdges(wsId: string) { return this.getList<ManualEdge>(wsId, 'edges'); }
  saveEdges(wsId: string, e: ManualEdge[]) { return this.setList(wsId, 'edges', e); }
  getLayout<T>(wsId: string) { return get<T>(k(wsId, 'layout'), store); }
  saveLayout<T>(wsId: string, layout: T) { return set(k(wsId, 'layout'), layout, store); }
  getKV<T>(key: string) { return get<T>(`kv:${key}`, store); }
  setKV<T>(key: string, value: T) { return set(`kv:${key}`, value, store); }
}

export const storage: StorageAdapter = new IndexedDbStorage();

/** Browser storage quota (real values from navigator.storage.estimate). */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e) return null;
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
