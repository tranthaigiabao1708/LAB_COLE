/**
 * CatalogAdapter — classes, domains, projects, users.
 * DEMO DATA: there is no identity/catalog backend yet. Everything here is mock data and is
 * labelled "Demo" in the UI. Replace with authenticated API calls (GET /me, /classes, /projects).
 */
import { storage } from './storage';
import { templateById } from './templates';
import type { Note, WorkspaceMeta } from '../lib/types';

export const IS_DEMO_CATALOG = true;

export const currentUser = { id: 'u-local', name: 'Lê Gia Bảo', email: 'student@demo.local', initials: 'GB' };

export interface Domain { id: string; name: string; description: string; color: string }
export interface ClassInfo { id: string; name: string; term: string; teacher: string; students: number; schedule: string }
export interface Project {
  id: string; classId: string; domainId: string; templateId: string;
  name: string; summary: string; tags: string[]; level: string;
}

export const DOMAINS: Domain[] = [
  { id: 'ecommerce', name: 'E-commerce', description: 'Bán lẻ thời trang, đơn hàng, khách hàng, kho (Cole Labs).', color: 'var(--c-teal)' },
  { id: 'banking', name: 'Banking', description: 'Giao dịch, rủi ro tín dụng, gian lận.', color: 'var(--c-amber)' },
  { id: 'healthcare', name: 'Healthcare', description: 'Nhập viện, chẩn đoán, tái nhập viện.', color: 'var(--c-rose)' },
];

export const CLASSES: ClassInfo[] = [
  { id: 'aie-k12', name: 'AI Engineer Fullstack · K12', term: '2026 · Q3', teacher: 'ThS. Nguyễn Minh', students: 28, schedule: 'T3, T5 · 19:00' },
  { id: 'ds-k5', name: 'Data Science Foundation · K5', term: '2026 · Q3', teacher: 'TS. Trần Hạnh', students: 34, schedule: 'T7 · 09:00' },
];

export const PROJECTS: Project[] = [
  { id: 'p-ecom-churn', classId: 'aie-k12', domainId: 'ecommerce', templateId: 'ecom-churn', name: 'Customer churn & segmentation', summary: 'Dự đoán khách rời bỏ và phân nhóm khách hàng Cole Labs.', tags: ['Tabular ML', 'RFM', 'SQL'], level: 'Module 2' },
  { id: 'p-bank-fraud', classId: 'aie-k12', domainId: 'banking', templateId: 'bank-fraud', name: 'Transaction fraud detection', summary: 'Phát hiện gian lận trên dữ liệu mất cân bằng.', tags: ['Imbalanced', 'Classification'], level: 'Module 2' },
  { id: 'p-ecom-rag', classId: 'aie-k12', domainId: 'ecommerce', templateId: 'blank', name: 'CSKH chatbot (RAG)', summary: 'Chatbot hỏi đáp chính sách. Vector DB chưa có trong prototype.', tags: ['RAG', 'LLM'], level: 'Module 5' },
  { id: 'p-health-readmit', classId: 'ds-k5', domainId: 'healthcare', templateId: 'health-readmit', name: 'Readmission risk', summary: 'Dự đoán tái nhập viện trong 30 ngày.', tags: ['EDA', 'Classification'], level: 'Capstone' },
];

export const projectById = (id: string) => PROJECTS.find((p) => p.id === id);
export const classById = (id: string) => CLASSES.find((c) => c.id === id);
export const domainById = (id: string) => DOMAINS.find((d) => d.id === id);

const uid = (p: string) => p + '-' + Math.random().toString(36).slice(2, 10);

/** Creates (or returns) the single persistent workspace of a project for the current user. */
const inflight = new Map<string, Promise<WorkspaceMeta>>();
export function ensureWorkspace(projectId: string): Promise<WorkspaceMeta> {
  // Concurrent callers (e.g. StrictMode double effects) must share one creation.
  const running = inflight.get(projectId);
  if (running) return running;
  const p = createOrGet(projectId).finally(() => inflight.delete(projectId));
  inflight.set(projectId, p);
  return p;
}

async function createOrGet(projectId: string): Promise<WorkspaceMeta> {
  const existing = (await storage.listWorkspaces()).find((w) => w.projectId === projectId);
  if (existing) return existing;
  const project = projectById(projectId);
  if (!project) throw new Error('Unknown project ' + projectId);
  const tpl = templateById(project.templateId);
  if (!tpl) throw new Error('Unknown template ' + project.templateId);
  const now = Date.now();
  const ws: WorkspaceMeta = {
    id: uid('ws'), projectId, templateId: tpl.id, classId: project.classId, domainId: project.domainId,
    name: project.name, createdAt: now, lastOpenedAt: now,
    runtimeProfile: { engine: 'pyodide-browser-worker', image: 'python-3.12 · pandas · scikit-learn (Pyodide 0.26.4)', memoryLimitMB: 2048 },
  };
  for (const f of tpl.build()) {
    await storage.writeFile(ws.id, { path: f.path, content: f.content, encoding: 'utf8', size: new Blob([f.content]).size, createdAt: now, updatedAt: now, origin: 'template' });
  }
  const note: Note = {
    id: uid('note'), workspaceId: ws.id, title: 'Kế hoạch của tôi', status: 'doing', links: [], createdAt: now, updatedAt: now,
    body: 'Đang làm: \nĐã thực hiện: \nKết quả: \nTiếp theo: \nVấn đề gặp phải: ',
  };
  await storage.saveNotes(ws.id, [note]);
  await storage.saveWorkspace(ws);
  return ws;
}
