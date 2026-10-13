import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FilePlus2, Folder, FolderOpen, PanelRightOpen, Trash2, Upload, Boxes, ListCollapse } from 'lucide-react';
import { useWs, validatePath } from '../state/workspace';
import { storage } from '../adapters/storage';
import { FileIcon } from '../components/ui';
import { confirmDialog, promptDialog, toast } from '../components/dialogs';
import { downloadContent, fmtBytes, basename } from '../lib/format';
import type { FileMeta } from '../lib/types';

interface TreeNode { name: string; path: string; dir: boolean; children: TreeNode[]; meta?: FileMeta }

function buildTree(files: Record<string, FileMeta>): TreeNode {
  const root: TreeNode = { name: '', path: '', dir: true, children: [] };
  for (const path of Object.keys(files).sort()) {
    const parts = path.split('/');
    let cur = root;
    parts.forEach((part, i) => {
      const p = parts.slice(0, i + 1).join('/');
      const isDir = i < parts.length - 1;
      let child = cur.children.find((c) => c.name === part && c.dir === isDir);
      if (!child) {
        child = { name: part, path: p, dir: isDir, children: [], meta: isDir ? undefined : files[path] };
        cur.children.push(child);
      }
      cur = child;
    });
  }
  const sort = (n: TreeNode) => { n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1)); n.children.forEach(sort); };
  sort(root);
  return root;
}

export default function Explorer() {
  const files = useWs((s) => s.files);
  const buffers = useWs((s) => s.buffers);
  const artifacts = useWs((s) => s.artifacts);
  const ws = useWs((s) => s.ws)!;
  const activeRef = useWs((s) => s.layout.groups.main.tabs.find((t) => t.id === s.layout.groups.main.active)?.ref);
  const [open, setOpen] = useState<Record<string, boolean>>({ data: true, 'data/raw': true, notebooks: true, src: true, artifacts: true });
  const [uploadDir, setUploadDir] = useState('data/uploads');
  const inputRef = useRef<HTMLInputElement>(null);
  const tree = useMemo(() => buildTree(files), [files]);
  const artSet = useMemo(() => new Set(artifacts.map((a) => a.path)), [artifacts]);
  const { openFile, deleteFile, createFile, uploadFiles } = useWs.getState();

  const newFile = async (dir = '') => {
    const p = await promptDialog({
      title: 'Tạo file mới', label: 'Đường dẫn trong workspace', defaultValue: dir ? `${dir}/untitled.py` : 'src/untitled.py',
      message: 'Đuôi .ipynb tạo notebook; .py/.sql/.md mở bằng editor tương ứng.',
      validate: (v) => validatePath(v) ?? (files[v] ? 'File đã tồn tại' : null),
    });
    if (!p) return;
    const content = p.endsWith('.ipynb')
      ? JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [{ id: 'c1', cell_type: 'code', source: '', metadata: {}, outputs: [], execution_count: null }] }, null, 1)
      : '';
    try { await createFile(p, content); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const del = async (path: string) => {
    const isArt = artSet.has(path);
    if (!(await confirmDialog({ title: `Xoá ${basename(path)}?`, message: `File sẽ bị xoá khỏi workspace storage.${isArt ? ' Bản ghi artifact vẫn còn nhưng sẽ hiện trạng thái "file missing".' : ''}`, confirmText: 'Xoá', danger: true }))) return;
    await deleteFile(path);
    toast(`Đã xoá ${path}`, 'info');
  };

  const download = async (path: string) => {
    const c = useWs.getState().contents[path] ?? (await storage.readFile(ws.id, path));
    if (c === undefined) return toast('Không đọc được nội dung file', 'error');
    downloadContent(basename(path), c, files[path].encoding);
  };

  const render = (n: TreeNode, depth: number): React.ReactNode => {
    if (n.dir) {
      const isOpen = open[n.path] ?? false;
      return (
        <div key={'d:' + n.path}>
          <div className="tree-row" style={{ paddingLeft: 6 + depth * 12 }} onClick={() => setOpen((o) => ({ ...o, [n.path]: !isOpen }))}>
            <span className="tw">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
            {isOpen ? <FolderOpen size={14} color="hsl(38 70% 60%)" /> : <Folder size={14} color="hsl(38 70% 60%)" />}
            <span className="ellipsis">{n.name}</span>
            <span className="meta acts">
              <button className="icon-btn sm" title="New file here" onClick={(e) => { e.stopPropagation(); void newFile(n.path); }}><FilePlus2 size={13} /></button>
              <button className="icon-btn sm" title="Upload here" onClick={(e) => { e.stopPropagation(); setUploadDir(n.path); inputRef.current?.click(); }}><Upload size={13} /></button>
            </span>
          </div>
          {isOpen && n.children.map((c) => render(c, depth + 1))}
        </div>
      );
    }
    const dirty = n.path in buffers;
    const isArt = artSet.has(n.path);
    return (
      <div
        key={'f:' + n.path}
        className={`tree-row ${activeRef === n.path ? 'on' : ''}`}
        style={{ paddingLeft: 20 + depth * 12 }}
        onClick={() => openFile(n.path)}
        title={`${n.path}\n${fmtBytes(n.meta?.size)} · origin: ${n.meta?.origin}${n.meta?.notSynced ? '\n⚠ NOT persisted (too large to sync)' : ''}`}
      >
        <FileIcon path={n.path} />
        <span className={`ellipsis ${n.meta?.notSynced ? 't-red' : ''}`}>{n.name}</span>
        <span className="meta meta-static">
          {dirty && <span className="dirty-dot" title="Unsaved changes in editor buffer" />}
          {isArt && <Boxes size={11} className="t-accent" aria-label="Registered artifact" />}
        </span>
        <span className="meta acts">
          <button className="icon-btn sm" title="Open to the side" onClick={(e) => { e.stopPropagation(); openFile(n.path, 'side'); }}><PanelRightOpen size={13} /></button>
          <button className="icon-btn sm" title="Download" onClick={(e) => { e.stopPropagation(); void download(n.path); }}><Download size={13} /></button>
          <button className="icon-btn sm" title="Delete" onClick={(e) => { e.stopPropagation(); void del(n.path); }}><Trash2 size={13} /></button>
        </span>
      </div>
    );
  };

  return (
    <div className="pane">
      <div className="pane-h">
        <span className="title">Explorer</span>
        <div className="grow" />
        <button className="icon-btn" id="explorer-new" title="New file" onClick={() => void newFile()}><FilePlus2 size={15} /></button>
        <button className="icon-btn" id="explorer-upload" title="Upload files to data/uploads" onClick={() => { setUploadDir('data/uploads'); inputRef.current?.click(); }}><Upload size={15} /></button>
        <button className="icon-btn" title="Collapse all" onClick={() => setOpen({})}><ListCollapse size={15} /></button>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) void uploadFiles(e.target.files, uploadDir).then(() => toast('Đã tải file lên workspace storage', 'success')); e.target.value = ''; }} />
      </div>
      <div className="pane-b">
        <div className="tree">{tree.children.map((c) => render(c, 0))}</div>
      </div>
      <div className="p-8 xs dim" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="row"><span className="dot green" style={{ width: 6, height: 6, boxShadow: 'none' }} />Lưu tại <span className="mono">{storage.backend}</span></div>
        <div className="mono ellipsis" title={ws.id}>{Object.keys(files).length} files · {fmtBytes(Object.values(files).reduce((a, f) => a + f.size, 0))} · {ws.id}</div>
      </div>
    </div>
  );
}
