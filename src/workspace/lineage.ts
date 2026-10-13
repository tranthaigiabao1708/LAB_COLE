import type { Artifact, FileMeta, ManualEdge, RunRecord } from '../lib/types';

export interface LNode {
  id: string;
  label: string;
  kind: 'artifact' | 'file' | 'manual';
  artifact?: Artifact;
  file?: FileMeta;
  exists: boolean;
  stale: boolean;
  staleInputs: string[];
  failedRun?: RunRecord;
  producedBy?: RunRecord;
  depth: number;
  row: number;
}

export interface LEdge {
  id: string;
  from: string;
  to: string;
  kind: 'auto' | 'manual' | 'session';
  label: string;
  runId?: string;
}

/**
 * Lineage graph.
 * - auto edges: captured by runtime instrumentation (files opened for read → files written in the same run).
 * - manual edges: declared by the student; rendered differently and never presented as captured facts.
 */
export function buildLineage(artifacts: Artifact[], files: Record<string, FileMeta>, runs: RunRecord[], manual: ManualEdge[]) {
  const nodes = new Map<string, LNode>();
  const edges: LEdge[] = [];
  const runById = new Map(runs.map((r) => [r.id, r]));
  const artByPath = new Map(artifacts.map((a) => [a.path, a]));

  const ensure = (id: string, manualOnly = false) => {
    if (nodes.has(id)) return nodes.get(id)!;
    const artifact = artByPath.get(id);
    const file = files[id];
    const n: LNode = {
      id, label: id, kind: artifact ? 'artifact' : file ? 'file' : manualOnly ? 'manual' : 'file',
      artifact, file, exists: !!file, stale: false, staleInputs: [], depth: 0, row: 0,
      producedBy: artifact?.createdByRunId ? runById.get(artifact.createdByRunId) : undefined,
    };
    nodes.set(id, n);
    return n;
  };

  for (const a of artifacts) {
    if (!a.inputs.length && a.registration === 'manual') continue;
    const to = ensure(a.path);
    for (const input of a.inputs) {
      const from = ensure(input);
      edges.push({ id: `auto:${input}->${a.path}`, from: input, to: a.path, kind: 'auto', label: a.source, runId: a.createdByRunId });
      const inMeta = files[input];
      if (inMeta && inMeta.updatedAt > a.updatedAt + 500) {
        to.stale = true;
        to.staleInputs.push(input);
      }
      void from;
    }
  }
  // Artifacts with no captured inputs still appear as standalone nodes.
  for (const a of artifacts) ensure(a.path);

  // Session context (inferred): for artifacts whose producing run captured no file reads,
  // candidates = files read earlier in the same runtime session + datasets written earlier in it.
  // Keep only the nearest candidates (drop any candidate that is an ancestor of another one).
  // Rendered dotted and labelled "inferred" — never presented as captured I/O.
  const sessionOf = (a: Artifact) => (a.createdByRunId ? runById.get(a.createdByRunId)?.sessionId : undefined);
  const parents = new Map<string, Set<string>>(artifacts.map((a) => [a.path, new Set(a.inputs)]));
  const ancestors = (p: string, seen = new Set<string>()): Set<string> => {
    for (const q of parents.get(p) ?? []) if (!seen.has(q)) { seen.add(q); ancestors(q, seen); }
    return seen;
  };
  for (const a of [...artifacts].sort((x, y) => x.updatedAt - y.updatedAt)) {
    const sid = sessionOf(a);
    if (a.inputs.length || !sid) continue;
    const cands = new Set(a.sessionInputs ?? []);
    for (const b of artifacts) {
      if (b !== a && b.type === 'dataset' && b.createdByRunId !== a.createdByRunId && sessionOf(b) === sid && b.updatedAt <= a.updatedAt) cands.add(b.path);
    }
    cands.delete(a.path);
    const list = [...cands];
    const nearest = list.filter((c) => !list.some((o) => o !== c && ancestors(o).has(c)));
    if (!nearest.length) continue;
    parents.set(a.path, new Set(nearest));
    for (const input of nearest) {
      ensure(input);
      edges.push({ id: `session:${input}->${a.path}`, from: input, to: a.path, kind: 'session', label: 'same runtime session · inferred (data may have flowed through memory)', runId: a.createdByRunId });
    }
  }

  for (const e of manual) {
    ensure(e.from, true);
    ensure(e.to, true);
    edges.push({ id: e.id, from: e.from, to: e.to, kind: 'manual', label: e.label });
  }

  // Last failed attempt of the code that produces an artifact (after its latest version).
  for (const n of nodes.values()) {
    if (!n.artifact) continue;
    const src = n.artifact.source;
    const failed = runs.filter((r) => r.status === 'error' && r.startedAt > n.artifact!.updatedAt && `${r.source}${r.cellIndex != null ? ` · cell ${r.cellIndex + 1}` : ''}` === src);
    if (failed.length) n.failedRun = failed[failed.length - 1];
  }

  // Longest-path layering with cycle guard.
  const incoming = new Map<string, string[]>();
  for (const e of edges) incoming.set(e.to, [...(incoming.get(e.to) ?? []), e.from]);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const d = Math.max(-1, ...(incoming.get(id) ?? []).map(depthOf)) + 1;
    visiting.delete(id);
    memo.set(id, d);
    return d;
  };
  const byDepth = new Map<number, LNode[]>();
  for (const n of nodes.values()) {
    n.depth = depthOf(n.id);
    byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), n]);
  }
  for (const list of byDepth.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id)).forEach((n, i) => { n.row = i; });
  }
  return { nodes: [...nodes.values()], edges };
}
