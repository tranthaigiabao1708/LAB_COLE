/*
 * AI Lab — Runtime worker (RuntimeAdapter: "pyodide-browser")
 *
 * One worker instance == one isolated runtime session for one workspace.
 * - Code runs in CPython compiled to WebAssembly (Pyodide), off the browser main thread.
 * - The in-memory filesystem (/workspace) is a *hydrated copy* of persisted workspace files.
 *   It is NOT the source of truth: after every execution, changed files are sent back to
 *   the main thread, which persists them through the StorageAdapter.
 * - Terminating this worker destroys runtime memory (variables, DataFrames) only.
 *
 * Production replacement: a Jupyter kernel / container per workspace exposing the same
 * message contract (init, exec, profile, vars, sql, writeFile, deleteFile, info).
 */
const PYODIDE_VERSION = '0.26.4';
const INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/';
const MAX_SYNC_BYTES = 25 * 1024 * 1024;
const TEXT_EXT = new Set(['py', 'md', 'txt', 'csv', 'tsv', 'json', 'jsonl', 'ndjson', 'sql', 'yaml', 'yml', 'toml', 'ipynb', 'html', 'xml', 'svg', 'log', 'ini', 'cfg']);

let pyodide = null;
let currentExecId = null;

const BOOT_PY = String.raw`
import sys, os, io, json, ast, builtins, traceback, base64, time, types
os.makedirs('/workspace', exist_ok=True)
os.makedirs('/lab_runtime', exist_ok=True)
os.chdir('/workspace')
for _p in ['/lab_runtime', '/workspace/src', '/workspace']:
    if _p not in sys.path:
        sys.path.insert(0, _p)
os.environ['MPLBACKEND'] = 'AGG'

_WS = '/workspace/'
_user_ns = {'__name__': '__main__', 'Out': {}}
_io = {'inputs': set(), 'outputs': set()}
# Files read by any earlier execution in this session. Reported as *session context*
# (possible, not proven, ancestors), never merged into captured per-run inputs.
_session_reads = set()
_state = {'count': 0}
_profile_cache = {}
import warnings
warnings.filterwarnings('ignore', message=r'(?s).*Pyarrow will become a required dependency.*')

def _rel(p):
    try:
        p = os.path.abspath(os.fspath(p))
    except Exception:
        return None
    if isinstance(p, str) and p.startswith(_WS):
        return p[len(_WS):]
    return None

_orig_open = builtins.open
def _hooked_open(file, mode='r', *args, **kwargs):
    # Runtime instrumentation: records which workspace files were read / written.
    if isinstance(file, (str, os.PathLike)):
        r = _rel(file)
        if r:
            if any(c in mode for c in 'wax+'):
                _io['outputs'].add(r)
            else:
                _io['inputs'].add(r)
    return _orig_open(file, mode, *args, **kwargs)
builtins.open = _hooked_open

def _snapshot():
    out = {}
    for root, dirs, files in os.walk('/workspace'):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != '__pycache__']
        for f in files:
            full = os.path.join(root, f)
            try:
                st = os.stat(full)
                out[full[len(_WS):]] = (st.st_mtime_ns, st.st_size)
            except Exception:
                pass
    return out

def _df_payload(df, ref=None, n=50):
    head = df.head(n)
    split = json.loads(head.to_json(orient='split', date_format='iso', default_handler=str))
    return {
        'kind': 'dataframe', 'ref': ref,
        'shape': [int(df.shape[0]), int(df.shape[1])],
        'columns': [{'name': str(c), 'dtype': str(t)} for c, t in df.dtypes.items()],
        'index': [str(i) for i in split.get('index', [])],
        'rows': split.get('data', []),
        'truncated': bool(len(df) > n),
        'missing': int(df.isna().sum().sum()),
    }

def _display(val, ref):
    pd = sys.modules.get('pandas')
    if pd is not None:
        if isinstance(val, pd.DataFrame):
            return _df_payload(val, ref)
        if isinstance(val, pd.Series):
            return _df_payload(val.to_frame(), ref)
    r = repr(val)
    return {'kind': 'text', 'text': r[:20000], 'truncated': len(r) > 20000}

def _collect_figures():
    if 'matplotlib.pyplot' not in sys.modules:
        return []
    plt = sys.modules['matplotlib.pyplot']
    out = []
    for num in plt.get_fignums():
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        out.append(base64.b64encode(buf.getvalue()).decode())
    plt.close('all')
    return out

def _lab_exec(code, filename):
    _io['inputs'].clear(); _io['outputs'].clear()
    _state['count'] += 1
    n = _state['count']
    before = _snapshot()
    result, error = None, None
    try:
        tree = ast.parse(code, filename, 'exec')
        last_expr, last_name = None, None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            node = tree.body.pop()
            last_expr = ast.Expression(node.value)
            if isinstance(node.value, ast.Name):
                last_name = node.value.id
        exec(compile(tree, filename, 'exec'), _user_ns)
        if last_expr is not None:
            val = eval(compile(last_expr, filename, 'eval'), _user_ns)
            if val is not None:
                _user_ns['_'] = val
                ref = last_name
                if ref is None:
                    _user_ns['Out'][n] = val
                    ref = 'Out[%d]' % n
                result = _display(val, ref)
    except BaseException as e:
        frames = traceback.extract_tb(e.__traceback__)[1:]
        tb = ['Traceback (most recent call last):\n'] + traceback.format_list(frames) + traceback.format_exception_only(type(e), e)
        if not frames:
            tb = traceback.format_exception_only(type(e), e)
        error = {'ename': type(e).__name__, 'evalue': str(e), 'traceback': tb}
    try:
        figures = _collect_figures()
    except Exception:
        figures = []
    after = _snapshot()
    changed = set(p for p, v in after.items() if before.get(p) != v)
    changed |= (set(_io['outputs']) & set(after))
    deleted = sorted(p for p in before if p not in after)
    inputs = sorted(p for p in _io['inputs'] if (p in before or p in after))
    session_inputs = sorted(p for p in _session_reads if p in after and p not in inputs and p not in changed)
    _session_reads.update(inputs)
    mods = sorted(set(
        m for m, mod in list(sys.modules.items())
        if getattr(mod, '__file__', None) and str(mod.__file__).startswith(_WS)
    ))
    return json.dumps({
        'execCount': n, 'result': result, 'error': error, 'figures': figures,
        'inputs': inputs, 'sessionInputs': session_inputs, 'outputs': sorted(changed), 'deleted': deleted,
        'workspaceModules': mods,
    }, default=str)

def _load_target(t):
    pd = __import__('pandas')
    if t['kind'] == 'file':
        path = t['path']
        full = os.path.join('/workspace', path)
        st = os.stat(full)
        key = (path, st.st_mtime_ns, st.st_size)
        if key in _profile_cache:
            return _profile_cache[key]
        ext = path.rsplit('.', 1)[-1].lower()
        if ext == 'csv':
            df = pd.read_csv(full)
        elif ext == 'tsv':
            df = pd.read_csv(full, sep='\t')
        elif ext in ('parquet', 'pq'):
            df = pd.read_parquet(full)
        elif ext in ('jsonl', 'ndjson'):
            df = pd.read_json(full, lines=True)
        elif ext == 'json':
            df = pd.read_json(full)
        else:
            raise ValueError('Unsupported tabular format: .' + ext)
        _profile_cache.clear()
        _profile_cache[key] = df
        return df
    val = eval(t['expr'], _user_ns)
    if isinstance(val, pd.Series):
        val = val.to_frame()
    if not isinstance(val, pd.DataFrame):
        raise TypeError(t['expr'] + ' is not a DataFrame (got ' + type(val).__name__ + ')')
    return val

def _lab_profile(target_json):
    import numpy as np
    pd = __import__('pandas')
    t = json.loads(target_json)
    df = _load_target(t)
    if t.get('query'):
        df = df.query(t['query'])
    page, size = int(t.get('page', 0)), int(t.get('pageSize', 100))
    rows = df.iloc[page * size:(page + 1) * size]
    split = json.loads(rows.to_json(orient='split', date_format='iso', default_handler=str))
    res = {
        'shape': [int(df.shape[0]), int(df.shape[1])],
        'columns': [{'name': str(c), 'dtype': str(tp)} for c, tp in df.dtypes.items()],
        'index': [str(i) for i in split.get('index', [])],
        'rows': split.get('data', []), 'page': page, 'pageSize': size,
    }
    if t.get('profile', True):
        cols = []
        for c in df.columns:
            s = df[c]
            info = {'name': str(c), 'dtype': str(s.dtype), 'missing': int(s.isna().sum())}
            try:
                info['unique'] = int(s.nunique(dropna=True))
            except Exception:
                info['unique'] = None
            if pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
                d = s.dropna()
                info['kind'] = 'numeric'
                if len(d):
                    info.update(min=float(d.min()), max=float(d.max()), mean=float(d.mean()),
                                std=float(d.std()) if len(d) > 1 else 0.0, median=float(d.median()))
                    bins = int(min(16, max(1, d.nunique())))
                    counts, edges = np.histogram(d, bins=bins)
                    info['hist'] = {'counts': [int(x) for x in counts], 'edges': [float(x) for x in edges]}
            elif pd.api.types.is_datetime64_any_dtype(s):
                info.update(kind='datetime', min=str(s.min()), max=str(s.max()))
            else:
                vc = s.dropna().astype(str).value_counts().head(6)
                info.update(kind='categorical', top=[[str(k), int(v)] for k, v in vc.items()])
            cols.append(info)
        try:
            dups = int(df.duplicated().sum())
        except Exception:
            dups = None
        res['profile'] = {
            'columns': cols, 'duplicates': dups,
            'missingTotal': int(df.isna().sum().sum()),
            'memoryBytes': int(df.memory_usage(deep=True).sum()),
        }
    return json.dumps(res, default=str)

def _lab_vars():
    pd = sys.modules.get('pandas')
    np = sys.modules.get('numpy')
    out = []
    for k, v in list(_user_ns.items()):
        if k.startswith('_') or k in ('Out', 'In') or isinstance(v, types.ModuleType):
            continue
        if isinstance(v, type) or callable(v):
            continue
        item = {'name': k, 'type': type(v).__name__}
        if pd is not None and isinstance(v, (pd.DataFrame, pd.Series)):
            item['shape'] = list(v.shape)
            item['bytes'] = int(v.memory_usage(deep=False).sum()) if isinstance(v, pd.DataFrame) else int(v.memory_usage(deep=False))
            item['tabular'] = True
        elif np is not None and isinstance(v, np.ndarray):
            item['shape'] = list(v.shape)
            item['bytes'] = int(v.nbytes)
        else:
            r = repr(v)
            item['repr'] = r[:80] + ('…' if len(r) > 80 else '')
        out.append(item)
    return json.dumps(out, default=str)

def _sql_tables():
    import re
    out = []
    for root in ['data', 'artifacts']:
        for dirpath, dirs, files in os.walk(os.path.join('/workspace', root)):
            for f in sorted(files):
                if f.lower().endswith('.csv'):
                    name = re.sub(r'\W+', '_', os.path.splitext(f)[0]).lower()
                    out.append({'table': name, 'path': os.path.relpath(os.path.join(dirpath, f), '/workspace')})
    return out

def _lab_sql_tables():
    return json.dumps(_sql_tables())

def _lab_sql(query):
    import re, sqlite3
    pd = __import__('pandas')
    con = sqlite3.connect(':memory:')
    used = []
    for t in _sql_tables():
        if re.search(r'\b' + re.escape(t['table']) + r'\b', query, re.I):
            pd.read_csv(os.path.join('/workspace', t['path'])).to_sql(t['table'], con, index=False)
            used.append(t['path'])
    try:
        df = pd.read_sql_query(query, con)
    finally:
        con.close()
    p = _df_payload(df, None, n=500)
    p['inputs'] = used
    return json.dumps(p, default=str)
`;

const LAB_PY = String.raw`
"""lab — helper module injected by the AI Lab runtime.

log_experiment() writes a JSON record under experiments/ in the workspace.
The platform persists it like any other file and shows it in Models & Experiments.
Nothing is sent anywhere else.
"""
import json, os, time, uuid, pickle

def _default(o):
    if hasattr(o, 'item'):
        return o.item()
    if hasattr(o, 'tolist'):
        return o.tolist()
    return str(o)

def save_model(model, path):
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(path, 'wb') as f:
        pickle.dump(model, f)
    print('[lab] model saved: ' + path)
    return path

def log_experiment(name, metrics, params=None, model_type=None, framework=None, dataset=None,
                   confusion_matrix=None, labels=None, history=None, model_path=None, duration_s=None, tags=None):
    os.makedirs('experiments', exist_ok=True)
    eid = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
    rec = {
        'id': eid, 'name': name, 'model_type': model_type, 'framework': framework,
        'dataset': dataset, 'params': params or {}, 'metrics': metrics or {},
        'confusion_matrix': confusion_matrix, 'labels': labels, 'history': history,
        'model_path': model_path, 'duration_s': duration_s, 'tags': tags or [],
        'run_id': os.environ.get('AILAB_RUN_ID'), 'created_at': time.time(),
    }
    path = 'experiments/' + eid + '.json'
    with open(path, 'w') as f:
        json.dump(rec, f, indent=2, default=_default)
    print('[lab] experiment logged: ' + path)
    return eid
`;

function post(msg) { self.postMessage(msg); }
function reply(id, data) { post({ type: 'reply', id, ok: true, data }); }
function fail(id, error) { post({ type: 'reply', id, ok: false, error: String(error && error.message ? error.message : error) }); }

function heapMB() {
  try { return Math.round(pyodide._module.HEAP8.buffer.byteLength / 1048576); } catch { return null; }
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

function writeWsFile(path, content, encoding) {
  const full = '/workspace/' + path;
  const dir = full.substring(0, full.lastIndexOf('/'));
  pyodide.FS.mkdirTree(dir);
  if (encoding === 'base64') pyodide.FS.writeFile(full, b64ToBytes(content));
  else pyodide.FS.writeFile(full, content, { encoding: 'utf8' });
}

function readWsFile(path) {
  const full = '/workspace/' + path;
  let bytes;
  try { bytes = pyodide.FS.readFile(full); } catch { return null; }
  const size = bytes.length;
  if (size > MAX_SYNC_BYTES) return { path, size, tooLarge: true };
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (TEXT_EXT.has(ext)) {
    try { return { path, size, encoding: 'utf8', content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }; } catch { /* binary */ }
  }
  return { path, size, encoding: 'base64', content: bytesToB64(bytes) };
}

function callPy(name, ...args) {
  const fn = pyodide.globals.get(name);
  try { return fn(...args); } finally { fn.destroy(); }
}

async function init(msg) {
  post({ type: 'status', phase: 'Downloading Python runtime (Pyodide ' + PYODIDE_VERSION + ')…' });
  importScripts(INDEX_URL + 'pyodide.js');
  pyodide = await self.loadPyodide({ indexURL: INDEX_URL });
  pyodide.setStdout({ batched: (s) => currentExecId && post({ type: 'stream', id: currentExecId, name: 'stdout', text: s + '\n' }) });
  pyodide.setStderr({ batched: (s) => currentExecId && post({ type: 'stream', id: currentExecId, name: 'stderr', text: s + '\n' }) });
  post({ type: 'status', phase: 'Loading pandas + numpy…' });
  await pyodide.loadPackage(['pandas'], { messageCallback: () => {} });
  pyodide.runPython(BOOT_PY);
  pyodide.FS.writeFile('/lab_runtime/lab.py', LAB_PY, { encoding: 'utf8' });
  post({ type: 'status', phase: 'Hydrating workspace files…' });
  for (const f of msg.files || []) writeWsFile(f.path, f.content, f.encoding);
  const python = pyodide.runPython('import sys; sys.version.split()[0]');
  reply(msg.id, { pyodideVersion: pyodide.version, python, packages: Object.keys(pyodide.loadedPackages), heapMB: heapMB() });
}

function relatedSources(code) {
  // Include workspace modules (src/*.py) imported by this code so their imports get auto-loaded.
  let extra = '';
  try {
    for (const name of pyodide.FS.readdir('/workspace/src')) {
      if (!name.endsWith('.py')) continue;
      const mod = name.slice(0, -3);
      const re = new RegExp('(^|\\n)\\s*(from\\s+' + mod + '\\b|import\\s+[^\\n]*\\b' + mod + '\\b)');
      if (re.test(code)) extra += '\n' + pyodide.FS.readFile('/workspace/src/' + name, { encoding: 'utf8' });
    }
  } catch { /* no src dir */ }
  return extra;
}

async function doExec(msg) {
  currentExecId = msg.id;
  try {
    pyodide.runPython('import os; os.environ["AILAB_RUN_ID"] = ' + JSON.stringify(String(msg.runId || '')));
    try {
      await pyodide.loadPackagesFromImports(msg.code + relatedSources(msg.code), {
        messageCallback: (m) => { if (/^Loading|^Loaded/.test(m)) post({ type: 'stream', id: msg.id, name: 'system', text: m + '\n' }); },
        errorCallback: () => {},
      });
    } catch { /* surfaced as ImportError by Python */ }
    const res = JSON.parse(callPy('_lab_exec', msg.code, msg.filename || '<cell>'));
    res.changedFiles = res.outputs.map(readWsFile).filter(Boolean);
    res.heapMB = heapMB();
    res.packages = Object.keys(pyodide.loadedPackages);
    reply(msg.id, res);
  } finally {
    currentExecId = null;
  }
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'init': await init(msg); break;
      case 'exec': await doExec(msg); break;
      case 'profile': reply(msg.id, JSON.parse(callPy('_lab_profile', JSON.stringify(msg.target)))); break;
      case 'vars': reply(msg.id, JSON.parse(callPy('_lab_vars'))); break;
      case 'sqlTables': reply(msg.id, JSON.parse(callPy('_lab_sql_tables'))); break;
      case 'sql': {
        await pyodide.loadPackage(['sqlite3'], { messageCallback: () => {} });
        reply(msg.id, JSON.parse(callPy('_lab_sql', msg.query)));
        break;
      }
      case 'writeFile': writeWsFile(msg.path, msg.content, msg.encoding); reply(msg.id, true); break;
      case 'deleteFile': try { pyodide.FS.unlink('/workspace/' + msg.path); } catch { /* already gone */ } reply(msg.id, true); break;
      case 'info': reply(msg.id, { heapMB: heapMB(), packages: Object.keys(pyodide.loadedPackages) }); break;
      default: fail(msg.id, 'Unknown message type ' + msg.type);
    }
  } catch (e) {
    fail(msg.id, e);
  }
};
