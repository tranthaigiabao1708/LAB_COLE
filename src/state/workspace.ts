import { create } from 'zustand';
import { storage } from '../adapters/storage';
import { RuntimeClient, type ExecResponse, type RuntimeInfo } from '../adapters/runtime';
import type {
  Artifact, ArtifactType, Experiment, FileMeta, LogLine, ManualEdge, Note, ResultPayload,
  RunKind, RunRecord, RuntimeStatus, RuntimeVar, Selection, Tab, TabKind, WorkspaceMeta,
} from '../lib/types';
import { extOf, isTextExt } from '../lib/format';

export type SidebarView = 'explorer' | 'labs' | 'data' | 'runs' | 'artifacts' | 'models' | 'lineage' | 'connections' | 'notes';
export type BottomView = 'repl' | 'runs' | 'problems' | 'output' | 'runtime';
export type RightView = 'inspector' | 'notes' | 'docs';
export type GroupId = 'main' | 'side';

export interface Layout {
  sidebarView: SidebarView;
  sidebarOpen: boolean;
  bottomOpen: boolean;
  rightOpen: boolean;
  bottomView: BottomView;
  rightView: RightView;
  groups: Record<GroupId, { tabs: Tab[]; active?: string }>;
  docRef?: string;
}

const DEFAULT_LAYOUT: Layout = {
  sidebarView: 'explorer', sidebarOpen: true, bottomOpen: true, rightOpen: true,
  bottomView: 'runs', rightView: 'inspector',
  groups: { main: { tabs: [] }, side: { tabs: [] } },
};

export interface RuntimeState {
  status: RuntimeStatus;
  message?: string;
  info: RuntimeInfo;
  vars: RuntimeVar[];
  workspaceModules: string[];
}

interface ExecOptions {
  code: string;
  source: string;
  kind: RunKind;
  cellId?: string;
  cellIndex?: number;
}

interface WsState {
  ws: WorkspaceMeta | null;
  loading: boolean;
  error?: string;
  files: Record<string, FileMeta>;
  contents: Record<string, string>;
  buffers: Record<string, string>;
  saving: Record<string, boolean>;
  lastPersistAt?: number;
  persistError?: string;
  artifacts: Artifact[];
  runs: RunRecord[];
  notes: Note[];
  edges: ManualEdge[];
  experiments: Experiment[];
  runtime: RuntimeState;
  layout: Layout;
  selection: Selection;
  activeNoteId?: string;
  logs: LogLine[];
  dataVersion: number;

  open: (wsId: string) => Promise<void>;
  close: () => void;
  readFile: (path: string) => Promise<string | undefined>;
  setBuffer: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  saveAll: () => Promise<void>;
  createFile: (path: string, content?: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  uploadFiles: (files: FileList, dir: string) => Promise<void>;
  registerArtifact: (path: string) => Promise<void>;
  startRuntime: () => Promise<void>;
  stopRuntime: () => void;
  restartRuntime: () => Promise<void>;
  execute: (o: ExecOptions) => Promise<{ run: RunRecord; response?: ExecResponse }>;
  runSql: (query: string, source: string) => Promise<RunRecord>;
  refreshVars: () => Promise<void>;
  openFile: (path: string, group?: GroupId) => void;
  openTab: (tab: Tab, group?: GroupId) => void;
  closeTab: (id: string, group: GroupId) => void;
  setActiveTab: (id: string, group: GroupId) => void;
  setLayout: (patch: Partial<Layout>) => void;
  select: (sel: Selection) => void;
  addNote: (patch?: Partial<Note>) => string;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  openNote: (id: string) => void;
  addEdge: (from: string, to: string, label: string) => void;
  removeEdge: (id: string) => void;
  log: (level: LogLine['level'], source: string, message: string) => void;
}

let client: RuntimeClient | null = null;
const saveTimers = new Map<string, number>();
let layoutTimer = 0;
let notesTimer = 0;
let logSeq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const isArtifactCandidate = (path: string) =>
  !/\.(py|ipynb|md)$/i.test(path) && !path.includes('.ipynb_checkpoints') && !path.includes('__pycache__');

export function inferArtifactType(path: string): ArtifactType {
  const ext = extOf(path);
  if (path.startsWith('experiments/') && ext === 'json') return 'metrics';
  if (['csv', 'tsv', 'parquet', 'pq', 'jsonl', 'ndjson', 'feather', 'xlsx'].includes(ext)) return 'dataset';
  if (ext === 'json') return /metric|eval|report/i.test(path) ? 'metrics' : 'dataset';
  if (['pkl', 'joblib', 'pt', 'pth', 'onnx', 'h5', 'keras', 'safetensors'].includes(ext)) return 'model';
  if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext)) return 'chart';
  if (['html', 'pdf', 'txt'].includes(ext)) return 'report';
  if (['yaml', 'yml', 'toml', 'ini', 'cfg'].includes(ext)) return 'config';
  if (['faiss', 'index', 'ann'].includes(ext)) return 'index';
  return 'other';
}

export function tabKindFor(path: string): TabKind {
  const ext = extOf(path);
  if (ext === 'ipynb') return 'notebook';
  if (ext === 'sql') return 'sql';
  if (ext === 'md') return 'markdown';
  if (['csv', 'tsv', 'parquet', 'pq', 'jsonl', 'ndjson'].includes(ext)) return 'data';
  if (ext === 'json') return 'json';
  if (isTextExt(ext)) return 'code';
  return 'binary';
}

export function validatePath(path: string): string | null {
  if (!path || path.startsWith('/') || path.includes('\\')) return 'Path must be relative to the workspace root (e.g. src/utils.py).';
  if (path.split('/').some((s) => s === '..' || s === '.' || s === '')) return 'Path segments ".", ".." and empty segments are not allowed.';
  if (!/^[\w\-./ ]+$/.test(path)) return 'Only letters, digits, space, "-", "_", "." and "/" are allowed.';
  return null;
}

function trimResult(r: ResultPayload | null | undefined): ResultPayload | undefined {
  if (!r) return undefined;
  if (r.kind === 'dataframe') return { ...r, rows: r.rows.slice(0, 20), index: r.index.slice(0, 20) };
  return { ...r, text: r.text.slice(0, 4000) };
}

const emptyRuntime = (): RuntimeState => ({
  status: 'stopped', info: { sessionId: '', engine: 'pyodide-browser-worker', packages: [], heapMB: null }, vars: [], workspaceModules: [],
});

export const useWs = create<WsState>()((set, get) => {
  const persistLayout = () => {
    window.clearTimeout(layoutTimer);
    layoutTimer = window.setTimeout(() => {
      const { ws, layout } = get();
      if (ws) void storage.saveLayout(ws.id, layout);
    }, 400);
  };
  const persistNotes = () => {
    window.clearTimeout(notesTimer);
    notesTimer = window.setTimeout(() => {
      const { ws, notes } = get();
      if (ws) void storage.saveNotes(ws.id, notes);
    }, 500);
  };
  const persistRuns = () => {
    const { ws, runs } = get();
    if (ws) void storage.saveRuns(ws.id, runs);
  };
  const updateRun = (run: RunRecord) => set((s) => ({ runs: s.runs.map((r) => (r.id === run.id ? run : r)) }));

  const loadExperiments = async () => {
    const { ws, files } = get();
    if (!ws) return;
    const out: Experiment[] = [];
    for (const p of Object.keys(files).filter((x) => x.startsWith('experiments/') && x.endsWith('.json'))) {
      const txt = get().contents[p] ?? (await storage.readFile(ws.id, p));
      try {
        const j = JSON.parse(txt ?? '');
        if (j && j.metrics) out.push({ ...j, params: j.params ?? {}, file: p });
      } catch { /* not an experiment record */ }
    }
    out.sort((a, b) => b.created_at - a.created_at);
    set({ experiments: out });
  };

  const upsertArtifacts = async (paths: string[], run: RunRecord | null, inputs: string[], registration: Artifact['registration'], sessionInputs: string[] = []) => {
    const { ws } = get();
    if (!ws || !paths.length) return;
    const now = Date.now();
    const list = [...get().artifacts];
    for (const path of paths) {
      const meta = get().files[path];
      const size = meta?.size ?? 0;
      const ins = inputs.filter((i) => i !== path);
      const sess = sessionInputs.filter((i) => i !== path && !ins.includes(i));
      const source = run ? `${run.source}${run.cellIndex != null ? ` · cell ${run.cellIndex + 1}` : ''}` : 'Registered manually';
      const i = list.findIndex((a) => a.path === path);
      if (i >= 0) {
        const a = list[i];
        const version = a.version + 1;
        list[i] = { ...a, size, version, updatedAt: now, createdByRunId: run?.id ?? a.createdByRunId, source: run ? source : a.source, inputs: run ? ins : a.inputs, sessionInputs: run ? sess : a.sessionInputs, type: inferArtifactType(path), history: [...a.history, { version, at: now, size, runId: run?.id }] };
      } else {
        list.push({
          id: uid('art'), workspaceId: ws.id, path, type: inferArtifactType(path), size, version: 1, createdAt: now, updatedAt: now,
          createdByRunId: run?.id, source, inputs: ins, sessionInputs: sess, registration, storage: { backend: storage.backend, uri: storage.uri(ws.id, path) },
          history: [{ version: 1, at: now, size, runId: run?.id }],
        });
      }
    }
    set({ artifacts: list });
    await storage.saveArtifacts(ws.id, list);
  };

  const writePersisted = async (path: string, content: string, encoding: 'utf8' | 'base64', origin: FileMeta['origin'], size?: number) => {
    const { ws } = get();
    if (!ws) return;
    const now = Date.now();
    const prev = get().files[path];
    const meta = await storage.writeFile(ws.id, {
      path, content, encoding, origin: prev && origin === 'user' ? prev.origin === 'template' ? 'template' : origin : origin,
      size: size ?? (encoding === 'utf8' ? new TextEncoder().encode(content).length : Math.floor((content.length * 3) / 4)),
      createdAt: prev?.createdAt ?? now, updatedAt: now,
    });
    set((s) => ({ files: { ...s.files, [path]: { ...meta, createdAt: prev?.createdAt ?? now } }, contents: { ...s.contents, [path]: content }, lastPersistAt: now, persistError: undefined }));
  };

  return {
    ws: null, loading: false, files: {}, contents: {}, buffers: {}, saving: {}, artifacts: [], runs: [], notes: [], edges: [], experiments: [],
    runtime: emptyRuntime(), layout: DEFAULT_LAYOUT, selection: null, logs: [], dataVersion: 0,

    log: (level, source, message) => set((s) => ({ logs: [...s.logs.slice(-499), { id: ++logSeq, at: Date.now(), level, source, message }] })),

    open: async (wsId) => {
      get().close();
      set({ loading: true, error: undefined });
      try {
        const ws = (await storage.listWorkspaces()).find((w) => w.id === wsId);
        if (!ws) throw new Error('Workspace not found in storage (or you do not have access).');
        const [files, artifacts, runs, notes, edges, layout] = await Promise.all([
          storage.listFiles(ws.id), storage.getArtifacts(ws.id), storage.getRuns(ws.id), storage.getNotes(ws.id), storage.getEdges(ws.id), storage.getLayout<Layout>(ws.id),
        ]);
        // Runs that were in-flight when the page closed can never complete.
        const fixedRuns = runs.map((r) => (r.status === 'running' || r.status === 'queued' ? { ...r, status: 'cancelled' as const, error: { ename: 'RuntimeLost', evalue: 'Runtime session ended before this run finished.', traceback: [] } } : r));
        let lay = layout ? { ...DEFAULT_LAYOUT, ...layout } : { ...DEFAULT_LAYOUT };
        if (!layout) {
          const first = Object.keys(files).filter((p) => p.endsWith('.ipynb')).sort()[0];
          const tabs: Tab[] = [{ id: 'markdown:README.md', kind: 'markdown', title: 'README.md', ref: 'README.md' }];
          if (first) tabs.push({ id: `notebook:${first}`, kind: 'notebook', title: first.split('/').pop()!, ref: first });
          lay = { ...lay, groups: { main: { tabs, active: tabs[tabs.length - 1].id }, side: { tabs: [] } } };
        }
        const updated = { ...ws, lastOpenedAt: Date.now() };
        void storage.saveWorkspace(updated);
        client = new RuntimeClient();
        client.onStatus = (status, message) => {
          set((s) => ({ runtime: { ...s.runtime, status, message, info: client?.info ?? s.runtime.info } }));
        };
        set({ ws: updated, files, artifacts, runs: fixedRuns, notes, edges, layout: lay, loading: false, runtime: emptyRuntime(), activeNoteId: notes[0]?.id });
        get().log('info', 'workspace', `Opened workspace "${ws.name}" · ${Object.keys(files).length} files restored from ${storage.backend}`);
        await loadExperiments();
      } catch (e) {
        set({ loading: false, error: (e as Error).message });
      }
    },

    close: () => {
      client?.stop();
      client = null;
      saveTimers.forEach((t) => window.clearTimeout(t));
      saveTimers.clear();
      set({ ws: null, files: {}, contents: {}, buffers: {}, saving: {}, artifacts: [], runs: [], notes: [], edges: [], experiments: [], runtime: emptyRuntime(), selection: null, logs: [] });
    },

    readFile: async (path) => {
      const { ws, contents } = get();
      if (path in contents) return contents[path];
      if (!ws) return undefined;
      const c = await storage.readFile(ws.id, path);
      if (c !== undefined) set((s) => ({ contents: { ...s.contents, [path]: c } }));
      return c;
    },

    setBuffer: (path, content) => {
      set((s) => ({ buffers: { ...s.buffers, [path]: content } }));
      window.clearTimeout(saveTimers.get(path));
      saveTimers.set(path, window.setTimeout(() => void get().saveFile(path), 900));
    },

    saveFile: async (path) => {
      window.clearTimeout(saveTimers.get(path));
      saveTimers.delete(path);
      const content = get().buffers[path];
      if (content === undefined) return;
      set((s) => ({ saving: { ...s.saving, [path]: true } }));
      try {
        await writePersisted(path, content, 'utf8', 'user');
        set((s) => {
          const buffers = { ...s.buffers };
          if (buffers[path] === content) delete buffers[path];
          return { buffers, saving: { ...s.saving, [path]: false } };
        });
        await client?.writeFile(path, content, 'utf8');
        const mod = path.startsWith('src/') && path.endsWith('.py') ? path.slice(4, -3).replace(/\//g, '.') : null;
        if (mod && get().runtime.workspaceModules.includes(mod)) {
          client?.markRestartRequired(`${path} changed after it was imported — restart to reload`);
          get().log('warn', 'runtime', `${path} was modified after import. Restart the runtime to use the new code.`);
        }
        if (path.startsWith('experiments/')) await loadExperiments();
        if (tabKindFor(path) === 'data') set((s) => ({ dataVersion: s.dataVersion + 1 }));
      } catch (e) {
        set((s) => ({ saving: { ...s.saving, [path]: false }, persistError: (e as Error).message }));
        get().log('error', 'storage', `Failed to persist ${path}: ${(e as Error).message}`);
      }
    },

    saveAll: async () => {
      await Promise.all(Object.keys(get().buffers).map((p) => get().saveFile(p)));
    },

    createFile: async (path, content = '') => {
      const err = validatePath(path);
      if (err) throw new Error(err);
      if (get().files[path]) throw new Error('A file with this path already exists.');
      await writePersisted(path, content, 'utf8', 'user');
      await client?.writeFile(path, content, 'utf8');
      get().log('info', 'storage', `Created ${path}`);
      get().openFile(path);
    },

    deleteFile: async (path) => {
      const { ws } = get();
      if (!ws) return;
      await storage.deleteFile(ws.id, path);
      await client?.deleteFile(path);
      set((s) => {
        const files = { ...s.files }; delete files[path];
        const contents = { ...s.contents }; delete contents[path];
        const buffers = { ...s.buffers }; delete buffers[path];
        const groups = { ...s.layout.groups };
        (Object.keys(groups) as GroupId[]).forEach((g) => {
          const tabs = groups[g].tabs.filter((t) => t.ref !== path);
          groups[g] = { tabs, active: tabs.some((t) => t.id === groups[g].active) ? groups[g].active : tabs[tabs.length - 1]?.id };
        });
        return { files, contents, buffers, layout: { ...s.layout, groups } };
      });
      persistLayout();
      get().log('info', 'storage', `Deleted ${path} from workspace storage`);
      if (path.startsWith('experiments/')) await loadExperiments();
    },

    uploadFiles: async (list, dir) => {
      for (const f of Array.from(list)) {
        const path = (dir ? dir.replace(/\/$/, '') + '/' : '') + f.name.replace(/[^\w\-. ]/g, '_');
        const err = validatePath(path);
        if (err) { get().log('error', 'upload', err); continue; }
        if (f.size > 50 * 1024 * 1024) { get().log('error', 'upload', `${f.name} is larger than the 50 MB prototype limit.`); continue; }
        const text = isTextExt(extOf(path));
        const content = text ? await f.text() : await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1] ?? '');
          r.readAsDataURL(f);
        });
        await writePersisted(path, content, text ? 'utf8' : 'base64', 'upload', f.size);
        await client?.writeFile(path, content, text ? 'utf8' : 'base64');
        get().log('info', 'upload', `Uploaded ${path} (${f.size} bytes)`);
      }
      set((s) => ({ dataVersion: s.dataVersion + 1 }));
    },

    registerArtifact: async (path) => {
      await upsertArtifacts([path], null, [], 'manual');
      get().log('info', 'artifacts', `Registered ${path} as artifact (manual)`);
    },

    startRuntime: async () => {
      const { ws } = get();
      if (!ws || !client) return;
      if (client.alive || client.status === 'starting') return;
      await get().saveAll();
      const files = get().files;
      const payload: { path: string; content: string; encoding: 'utf8' | 'base64' }[] = [];
      for (const [path, meta] of Object.entries(files)) {
        if (meta.notSynced) continue;
        const c = get().contents[path] ?? (await storage.readFile(ws.id, path));
        if (c !== undefined) payload.push({ path, content: c, encoding: meta.encoding });
      }
      get().log('info', 'runtime', `Starting runtime · hydrating ${payload.length} files from ${storage.backend}`);
      try {
        const info = await client.start(payload);
        set((s) => ({ runtime: { ...s.runtime, info, vars: [], workspaceModules: [] } }));
        get().log('info', 'runtime', `Runtime ${info.sessionId} ready · Python ${info.python} · Pyodide ${info.pyodideVersion}`);
      } catch (e) {
        get().log('error', 'runtime', `Runtime failed to start: ${(e as Error).message}`);
      }
    },

    stopRuntime: () => {
      if (!client) return;
      const sid = client.info.sessionId;
      client.stop();
      set((s) => ({ runtime: { ...s.runtime, vars: [], workspaceModules: [] } }));
      get().log('info', 'runtime', `Runtime ${sid} stopped. In-memory variables discarded; ${Object.keys(get().files).length} persisted files untouched.`);
    },

    restartRuntime: async () => {
      get().stopRuntime();
      await get().startRuntime();
    },

    execute: async ({ code, source, kind, cellId, cellIndex }) => {
      const { ws } = get();
      if (!ws || !client) throw new Error('No workspace open');
      await get().saveAll();
      if (!client.alive) await get().startRuntime();
      let run: RunRecord = {
        id: uid('run'), workspaceId: ws.id, sessionId: client.info.sessionId, kind, source, cellId, cellIndex, code,
        startedAt: Date.now(), status: 'running', stdout: '', stderr: '', system: '', inputs: [], outputs: [],
      };
      set((s) => ({ runs: [...s.runs, run] }));
      if (!client.alive) {
        run = { ...run, status: 'error', endedAt: Date.now(), durationMs: 0, error: { ename: 'RuntimeUnavailable', evalue: get().runtime.message || 'Runtime could not be started.', traceback: [] } };
        updateRun(run); persistRuns();
        return { run };
      }
      let flushT = 0;
      const live = { stdout: '', stderr: '', system: '' };
      const flush = () => { flushT = 0; run = { ...run, ...live }; updateRun(run); };
      try {
        const res = await client.exec({
          code, filename: cellIndex != null ? `${source}#cell${cellIndex + 1}` : source, runId: run.id,
          onStream: (name, text) => {
            live[name] = (live[name] + text).slice(-200000);
            if (!flushT) flushT = window.setTimeout(flush, 120);
          },
        });
        window.clearTimeout(flushT);
        for (const f of res.changedFiles) {
          if (f.tooLarge || f.content === undefined) {
            set((s) => ({ files: { ...s.files, [f.path]: { path: f.path, size: f.size, encoding: 'base64', createdAt: Date.now(), updatedAt: Date.now(), origin: 'runtime', notSynced: true } } }));
            get().log('warn', 'storage', `${f.path} (${f.size} bytes) exceeds the sync limit and exists only in runtime memory — it is NOT persisted.`);
            continue;
          }
          await writePersisted(f.path, f.content, f.encoding ?? 'utf8', 'runtime', f.size);
        }
        if (res.changedFiles.length) get().log('info', 'storage', `Persisted ${res.changedFiles.filter((f) => !f.tooLarge).length} file(s) written by run ${run.id}`);
        for (const p of res.deleted) {
          await storage.deleteFile(ws.id, p);
          set((s) => { const files = { ...s.files }; delete files[p]; return { files }; });
          get().log('warn', 'storage', `${p} was deleted by code in run ${run.id}`);
        }
        const persistedOutputs = res.changedFiles.filter((f) => !f.tooLarge).map((f) => f.path);
        run = {
          ...run, ...live, status: res.error ? 'error' : 'ok', endedAt: Date.now(), durationMs: Date.now() - run.startedAt,
          execCount: res.execCount, error: res.error ?? undefined, inputs: res.inputs, outputs: res.outputs, deleted: res.deleted,
          result: trimResult(res.result), figures: res.figures.length, heapMB: res.heapMB,
        };
        updateRun(run);
        await upsertArtifacts(persistedOutputs.filter(isArtifactCandidate), run, res.inputs, 'auto-runtime', res.sessionInputs ?? []);
        set((s) => ({ runtime: { ...s.runtime, workspaceModules: res.workspaceModules, info: client?.info ?? s.runtime.info }, dataVersion: s.dataVersion + (res.outputs.length ? 1 : 0) }));
        if (res.outputs.some((p) => p.startsWith('experiments/'))) await loadExperiments();
        persistRuns();
        void get().refreshVars();
        return { run, response: res };
      } catch (e) {
        window.clearTimeout(flushT);
        const stopped = !client?.alive;
        run = { ...run, ...live, status: stopped ? 'cancelled' : 'error', endedAt: Date.now(), durationMs: Date.now() - run.startedAt, error: { ename: stopped ? 'Cancelled' : 'RuntimeError', evalue: (e as Error).message, traceback: [] } };
        updateRun(run); persistRuns();
        return { run };
      }
    },

    runSql: async (query, source) => {
      const { ws } = get();
      if (!ws || !client) throw new Error('No workspace open');
      if (!client.alive) await get().startRuntime();
      let run: RunRecord = { id: uid('run'), workspaceId: ws.id, sessionId: client.info.sessionId, kind: 'sql', source, code: query, startedAt: Date.now(), status: 'running', stdout: '', stderr: '', system: '', inputs: [], outputs: [] };
      set((s) => ({ runs: [...s.runs, run] }));
      try {
        const res = await client.sql(query);
        run = { ...run, status: 'ok', endedAt: Date.now(), durationMs: Date.now() - run.startedAt, inputs: res.inputs ?? [], result: { ...res, rows: res.rows } };
      } catch (e) {
        run = { ...run, status: 'error', endedAt: Date.now(), durationMs: Date.now() - run.startedAt, error: { ename: 'SQLError', evalue: (e as Error).message, traceback: [] } };
      }
      updateRun(run);
      set((s) => ({ runs: s.runs.map((r) => (r.id === run.id ? { ...run, result: trimResult(run.result) } : r)) }));
      persistRuns();
      return run;
    },

    refreshVars: async () => {
      if (!client?.alive) return;
      try {
        const vars = await client.vars();
        set((s) => ({ runtime: { ...s.runtime, vars } }));
      } catch { /* runtime busy or stopped */ }
    },

    openFile: (path, group = 'main') => {
      const kind = tabKindFor(path);
      get().openTab({ id: `${kind}:${path}`, kind, title: path.split('/').pop() ?? path, ref: path }, group);
      get().select({ kind: get().artifacts.some((a) => a.path === path) ? 'artifact' : 'file', ref: path });
    },

    openTab: (tab, group = 'main') => {
      set((s) => {
        const groups = { ...s.layout.groups };
        const other: GroupId = group === 'main' ? 'side' : 'main';
        // A tab lives in one group only.
        if (groups[other].tabs.some((t) => t.id === tab.id) && group === 'main') {
          return { layout: { ...s.layout, groups: { ...groups, [other]: { ...groups[other], active: tab.id } } } };
        }
        if (group === 'side') {
          const tabs = groups.main.tabs.filter((t) => t.id !== tab.id);
          groups.main = { tabs, active: groups.main.active === tab.id ? tabs[tabs.length - 1]?.id : groups.main.active };
        }
        const g = groups[group];
        const tabs = g.tabs.some((t) => t.id === tab.id) ? g.tabs : [...g.tabs, tab];
        groups[group] = { tabs, active: tab.id };
        return { layout: { ...s.layout, groups } };
      });
      persistLayout();
    },

    closeTab: (id, group) => {
      set((s) => {
        const g = s.layout.groups[group];
        const idx = g.tabs.findIndex((t) => t.id === id);
        const tabs = g.tabs.filter((t) => t.id !== id);
        const active = g.active === id ? tabs[Math.min(idx, tabs.length - 1)]?.id : g.active;
        return { layout: { ...s.layout, groups: { ...s.layout.groups, [group]: { tabs, active } } } };
      });
      persistLayout();
    },

    setActiveTab: (id, group) => {
      set((s) => ({ layout: { ...s.layout, groups: { ...s.layout.groups, [group]: { ...s.layout.groups[group], active: id } } } }));
      persistLayout();
    },

    setLayout: (patch) => {
      set((s) => ({ layout: { ...s.layout, ...patch } }));
      persistLayout();
    },

    select: (selection) => set((s) => ({ selection, layout: selection ? { ...s.layout, rightView: s.layout.rightView === 'inspector' ? 'inspector' : s.layout.rightView } : s.layout })),

    addNote: (patch = {}) => {
      const { ws } = get();
      const now = Date.now();
      const note: Note = { id: uid('note'), workspaceId: ws?.id ?? '', title: 'Ghi chú mới', status: 'idea', body: '', links: [], createdAt: now, updatedAt: now, ...patch };
      set((s) => ({ notes: [note, ...s.notes], activeNoteId: note.id, layout: { ...s.layout, rightOpen: true, rightView: 'notes' } }));
      persistNotes();
      return note.id;
    },
    updateNote: (id, patch) => {
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)) }));
      persistNotes();
    },
    deleteNote: (id) => {
      set((s) => ({ notes: s.notes.filter((n) => n.id !== id), activeNoteId: s.activeNoteId === id ? undefined : s.activeNoteId }));
      persistNotes();
    },
    openNote: (id) => {
      set((s) => ({ activeNoteId: id, layout: { ...s.layout, rightOpen: true, rightView: 'notes' } }));
      persistLayout();
    },

    addEdge: (from, to, label) => {
      const { ws } = get();
      if (!ws) return;
      const edges = [...get().edges, { id: uid('edge'), from, to, label, createdAt: Date.now() }];
      set({ edges });
      void storage.saveEdges(ws.id, edges);
    },
    removeEdge: (id) => {
      const { ws } = get();
      if (!ws) return;
      const edges = get().edges.filter((e) => e.id !== id);
      set({ edges });
      void storage.saveEdges(ws.id, edges);
    },
  };
});

/** Profile/page a dataset in the runtime. Returns null when runtime is not running. */
export function getRuntimeClient() {
  return client;
}
