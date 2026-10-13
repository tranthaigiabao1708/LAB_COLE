/**
 * Domain model for the AI Lab platform.
 * These types are the contract between UI and adapters (storage / runtime / catalog).
 * Production backends should implement the same shapes.
 */

export type Role = 'student' | 'teacher' | 'ops';

export type FileEncoding = 'utf8' | 'base64';
export type FileOrigin = 'template' | 'user' | 'runtime' | 'upload';

export interface FileMeta {
  path: string;
  size: number;
  encoding: FileEncoding;
  createdAt: number;
  updatedAt: number;
  origin: FileOrigin;
  /** Set when the content was too large to be synced back from runtime. */
  notSynced?: boolean;
}

export interface WsFile extends FileMeta {
  content: string;
}

export interface WorkspaceMeta {
  id: string;
  projectId: string;
  templateId: string;
  classId: string;
  domainId: string;
  name: string;
  createdAt: number;
  lastOpenedAt: number;
  runtimeProfile: { engine: string; image: string; memoryLimitMB: number };
}

export type ArtifactType =
  | 'dataset' | 'model' | 'metrics' | 'chart' | 'notebook' | 'report'
  | 'config' | 'code' | 'index' | 'other';

export interface ArtifactVersion {
  version: number;
  at: number;
  size: number;
  runId?: string;
}

export interface Artifact {
  id: string;
  workspaceId: string;
  path: string;
  type: ArtifactType;
  size: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  createdByRunId?: string;
  /** Human readable origin, e.g. "notebooks/01_cleaning.ipynb · cell 5". */
  source: string;
  /** Workspace paths read by the run that produced the latest version. */
  inputs: string[];
  /**
   * Files read by *earlier* executions in the same runtime session. Possible ancestors only:
   * the runtime cannot prove the data flowed through memory into this artifact.
   */
  sessionInputs?: string[];
  registration: 'auto-runtime' | 'manual';
  storage: { backend: string; uri: string };
  history: ArtifactVersion[];
}

export type RunStatus = 'queued' | 'running' | 'ok' | 'error' | 'cancelled';
export type RunKind = 'cell' | 'file' | 'sql' | 'repl' | 'action';

export interface ExecError {
  ename: string;
  evalue: string;
  traceback: string[];
}

export interface DataFramePayload {
  kind: 'dataframe';
  ref: string | null;
  shape: [number, number];
  columns: { name: string; dtype: string }[];
  index: string[];
  rows: unknown[][];
  truncated: boolean;
  missing: number;
  inputs?: string[];
}

export interface TextPayload {
  kind: 'text';
  text: string;
  truncated?: boolean;
}

export type ResultPayload = DataFramePayload | TextPayload;

export interface RunRecord {
  id: string;
  workspaceId: string;
  sessionId: string;
  kind: RunKind;
  source: string;
  cellId?: string;
  cellIndex?: number;
  code: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: RunStatus;
  execCount?: number;
  stdout: string;
  stderr: string;
  system: string;
  error?: ExecError;
  inputs: string[];
  outputs: string[];
  deleted?: string[];
  result?: ResultPayload;
  figures?: number;
  heapMB?: number | null;
}

export type NoteStatus = 'idea' | 'doing' | 'done' | 'blocked';

export interface NoteLink {
  kind: 'file' | 'artifact' | 'run';
  ref: string;
  label: string;
}

export interface Note {
  id: string;
  workspaceId: string;
  title: string;
  status: NoteStatus;
  body: string;
  links: NoteLink[];
  createdAt: number;
  updatedAt: number;
}

export interface ManualEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  createdAt: number;
}

export interface Experiment {
  id: string;
  name: string;
  model_type?: string;
  framework?: string;
  dataset?: string;
  params: Record<string, unknown>;
  metrics: Record<string, number>;
  confusion_matrix?: number[][] | null;
  labels?: string[] | null;
  history?: Record<string, number[]> | null;
  model_path?: string | null;
  duration_s?: number | null;
  run_id?: string | null;
  created_at: number;
  tags?: string[];
  /** Path of the JSON record in workspace storage. */
  file: string;
}

export type RuntimeStatus =
  | 'stopped' | 'starting' | 'running' | 'busy' | 'error' | 'restart-required';

export interface RuntimeVar {
  name: string;
  type: string;
  shape?: number[];
  bytes?: number;
  repr?: string;
  tabular?: boolean;
}

export interface ColumnProfile {
  name: string;
  dtype: string;
  missing: number;
  unique: number | null;
  kind: 'numeric' | 'datetime' | 'categorical';
  min?: number | string;
  max?: number | string;
  mean?: number;
  std?: number;
  median?: number;
  hist?: { counts: number[]; edges: number[] };
  top?: [string, number][];
}

export interface ProfileResult {
  shape: [number, number];
  columns: { name: string; dtype: string }[];
  index: string[];
  rows: unknown[][];
  page: number;
  pageSize: number;
  profile?: {
    columns: ColumnProfile[];
    duplicates: number | null;
    missingTotal: number;
    memoryBytes: number;
  };
}

export type DataTarget =
  | { kind: 'file'; path: string }
  | { kind: 'var'; expr: string };

export type TabKind =
  | 'notebook' | 'code' | 'sql' | 'markdown' | 'json' | 'data' | 'artifacts'
  | 'lineage' | 'experiments' | 'run' | 'api' | 'lab' | 'binary' | 'welcome';

export interface Tab {
  id: string;
  kind: TabKind;
  title: string;
  /** File path, var expr, run id, lab id… depending on kind. */
  ref?: string;
}

export type Selection =
  | { kind: 'file'; ref: string }
  | { kind: 'artifact'; ref: string }
  | { kind: 'run'; ref: string }
  | { kind: 'experiment'; ref: string }
  | { kind: 'var'; ref: string }
  | null;

export interface LogLine {
  id: number;
  at: number;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}
