import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PRESET_AGENTS, PRESET_IDS } from './presets';
import { resolveAgents, dueAgents } from './agentScheduler';
import { matchAny } from './glob';
import { buildAgentContext, isAllowedDocTarget, stripCodeFence, type AgentFile } from './agentContext';
import { runAgentModel } from './agentRunner';
import type { AgentConfig, AgentStatus, ResolvedAgent } from './agentTypes';
import type { DirectModel } from '../useSettings';
import { showToast } from '../toast';

// Files an agent may read for context (text/code), capped so runs stay cheap.
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|py|go|rs|java|rb|php|c|cc|cpp|h|hpp|cs|html|css|scss|yml|yaml|toml|sh|sql)$/i;
const IGNORE = /(^|\/)(node_modules|\.git|dist|build|out|release|coverage|\.next|\.turbo|vendor)(\/|$)/;
const DEBOUNCE_MS = 45_000; // idle window before change-triggered agents fire.

interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: TreeNode[];
}

function configPath(root: string): string {
  return `${root.replace(/[\\/]+$/, '')}/.strix/agents.json`;
}

async function loadConfigs(root: string): Promise<AgentConfig[]> {
  try {
    const raw = await window.strix.fs.read(configPath(root));
    const parsed = JSON.parse(raw) as { agents?: AgentConfig[] };
    if (Array.isArray(parsed.agents)) return parsed.agents;
  } catch {
    /* no config yet */
  }
  return [];
}

async function saveConfigs(root: string, agents: AgentConfig[]): Promise<void> {
  const dir = `${root.replace(/[\\/]+$/, '')}/.strix`;
  try {
    await window.strix.fs.create(dir, 'directory').catch(() => {});
    await window.strix.fs.write(configPath(root), JSON.stringify({ agents }, null, 2));
  } catch {
    showToast('Could not save agent settings', 'error');
  }
}

// Cheap structure: every text file's workspace-relative path, no reads. This is
// the bulk of an agent's context and costs almost nothing in tokens.
async function gatherTree(root: string, cap = 600): Promise<string[]> {
  let tree: TreeNode;
  try {
    tree = (await window.strix.fs.tree(root)) as TreeNode;
  } catch {
    return [];
  }
  const rels: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (rels.length >= cap) return;
      const rel = n.path.slice(root.length).replace(/^[\\/]/, '').replace(/\\/g, '/');
      if (IGNORE.test(`/${rel}`)) continue;
      if (n.type === 'directory') walk(n.children ?? []);
      else if (TEXT_EXT.test(n.name)) rels.push(rel);
    }
  };
  walk(tree.children ?? []);
  return rels;
}

// Read the contents of specific (changed) files — capped small so a run stays an
// "agent-sized" call, not a whole-repo dump.
async function readFiles(
  root: string,
  rels: string[],
  opts: { maxFiles: number; maxFileBytes: number },
): Promise<AgentFile[]> {
  const picked = rels.filter((r) => TEXT_EXT.test(r)).slice(0, opts.maxFiles);
  const files: AgentFile[] = [];
  for (const rel of picked) {
    try {
      const content = await window.strix.fs.read(`${root}/${rel}`);
      files.push({ path: rel, content: content.slice(0, opts.maxFileBytes) });
    } catch {
      /* skip unreadable */
    }
  }
  return files;
}

export interface UseAgents {
  agents: ResolvedAgent[];
  statuses: Record<string, AgentStatus | undefined>;
  paused: boolean;
  setPaused: (v: boolean) => void;
  setConfig: (id: string, patch: Partial<AgentConfig>) => void;
  addCustom: (cfg: AgentConfig) => void;
  removeCustom: (id: string) => void;
  runNow: (id: string) => void;
  busy: boolean;
}

// Orchestrates the agent roster: persists config in the workspace, watches file
// changes (debounced) to wake due agents, and runs them one at a time.
export function useAgents(opts: {
  root: string | null;
  aiDirectModels: DirectModel[];
  aiServerUrl?: string;
  aiTemperature?: number;
  aiMaxTokens?: number;
  // Called when a doc agent rewrites a file, so the editor can reload it.
  onFileWritten?: (absPath: string) => void;
}): UseAgents {
  const { root } = opts;
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus | undefined>>({});
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  const agents = useMemo(() => resolveAgents(PRESET_AGENTS, configs), [configs]);

  // Keep the latest values reachable from stable callbacks (no re-subscribe).
  const ref = useRef({ agents, statuses, paused, root, opts });
  ref.current = { agents, statuses, paused, root, opts };

  // Load per-workspace config when the folder changes.
  useEffect(() => {
    if (!root) {
      setConfigs([]);
      setStatuses({});
      return;
    }
    let cancelled = false;
    void loadConfigs(root).then((c) => {
      if (!cancelled) setConfigs(c);
    });
    return () => {
      cancelled = true;
    };
  }, [root]);

  const persist = useCallback(
    (next: AgentConfig[]) => {
      setConfigs(next);
      if (root) void saveConfigs(root, next);
    },
    [root],
  );

  const upsert = useCallback(
    (id: string, patch: Partial<AgentConfig>) => {
      const existing = configs.find((c) => c.id === id);
      const next = existing
        ? configs.map((c) => (c.id === id ? { ...c, ...patch } : c))
        : [...configs, { id, enabled: false, model: 'auto', ...patch }];
      persist(next);
    },
    [configs, persist],
  );

  const setConfig = upsert;
  const addCustom = useCallback(
    (cfg: AgentConfig) => persist([...configs.filter((c) => c.id !== cfg.id), cfg]),
    [configs, persist],
  );
  const removeCustom = useCallback(
    (id: string) => {
      if (PRESET_IDS.has(id)) return; // presets disable, not delete
      persist(configs.filter((c) => c.id !== id));
      setStatuses((s) => ({ ...s, [id]: undefined }));
    },
    [configs, persist],
  );

  const setStatus = useCallback((id: string, patch: Partial<AgentStatus>) => {
    setStatuses((s) => ({ ...s, [id]: { ...(s[id] ?? { state: 'idle' }), ...patch } }));
  }, []);

  // Execute a single agent run (used by both the queue and Run-now). `changed`
  // is the set of files that woke it (empty on a manual run).
  const execute = useCallback(
    async (agent: ResolvedAgent, changed: string[]) => {
      const { root: r, opts: o } = ref.current;
      if (!r) return;
      setBusy(true);
      setStatus(agent.id, { state: 'running' });
      try {
        // Cheap structure for every run; read CONTENTS only for the changed
        // files (or a tiny sample on a manual run) — keeps each run small so it
        // doesn't exhaust the model/rate limits.
        const tree = await gatherTree(r);
        const toRead = changed.length ? changed : tree.slice(0, 6);
        const files = await readFiles(r, toRead, { maxFiles: 8, maxFileBytes: 8_000 });
        let currentTarget = '';
        if (agent.outputMode === 'doc' && agent.target) {
          currentTarget = await window.strix.fs.read(`${r}/${agent.target}`).catch(() => '');
        }
        const context = buildAgentContext({
          projectName: r.split(/[\\/]/).pop(),
          target: agent.outputMode === 'doc' ? agent.target : undefined,
          currentTarget,
          tree,
          files,
        });
        const text = await runAgentModel({
          persona: agent.persona,
          context,
          model: agent.model,
          aiDirectModels: o.aiDirectModels,
          aiServerUrl: o.aiServerUrl,
          temperature: o.aiTemperature,
          maxTokens: o.aiMaxTokens,
        });

        if (!text.trim()) {
          setStatus(agent.id, { state: 'error', lastMessage: 'Empty response', lastRun: Date.now() });
          return;
        }

        if (agent.outputMode === 'doc' && agent.target) {
          if (!isAllowedDocTarget(agent.target)) {
            setStatus(agent.id, {
              state: 'error',
              lastMessage: `Blocked: ${agent.target} is not an allowed doc file`,
              lastRun: Date.now(),
            });
            return;
          }
          await window.strix.fs.write(`${r}/${agent.target}`, stripCodeFence(text));
          o.onFileWritten?.(`${r}/${agent.target}`);
          setStatus(agent.id, {
            state: 'ok',
            lastRun: Date.now(),
            lastMessage: `Updated ${agent.target}`,
          });
        } else {
          setStatus(agent.id, {
            state: 'ok',
            lastRun: Date.now(),
            lastMessage: 'Report ready',
            report: text.trim(),
          });
        }
      } catch (e) {
        setStatus(agent.id, {
          state: 'error',
          lastRun: Date.now(),
          lastMessage: e instanceof Error ? e.message : 'Run failed',
        });
      } finally {
        setBusy(false);
      }
    },
    [setStatus],
  );

  // Sequential queue — only one agent runs at a time (keeps token spend + load
  // bounded). Ids are de-duplicated while queued; each carries the changed set
  // that triggered it (merged if re-queued before it runs).
  const queueRef = useRef<string[]>([]);
  const changedForRun = useRef<Map<string, Set<string>>>(new Map());
  const drainingRef = useRef(false);
  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (queueRef.current.length) {
        const id = queueRef.current.shift() as string;
        const changed = [...(changedForRun.current.get(id) ?? [])];
        changedForRun.current.delete(id);
        const agent = ref.current.agents.find((a) => a.id === id);
        if (agent) await execute(agent, changed);
      }
    } finally {
      drainingRef.current = false;
    }
  }, [execute]);

  const enqueue = useCallback(
    (ids: string[], changed: string[] = []) => {
      let added = false;
      for (const id of ids) {
        const set = changedForRun.current.get(id) ?? new Set<string>();
        changed.forEach((c) => set.add(c));
        changedForRun.current.set(id, set);
        if (!queueRef.current.includes(id)) {
          queueRef.current.push(id);
          setStatus(id, { state: 'queued' });
          added = true;
        }
      }
      if (added) void drain();
    },
    [drain, setStatus],
  );

  const runNow = useCallback((id: string) => enqueue([id]), [enqueue]);

  // Debounced change watcher: collect changed paths, and after the idle window
  // enqueue every due agent.
  const pendingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    const off = window.strix.fs.onChanged((paths) => {
      const cur = ref.current;
      if (cur.paused || !cur.root) return;
      const r = cur.root;
      for (const p of paths) {
        const rel = p.slice(r.length).replace(/^[\\/]/, '').replace(/\\/g, '/');
        if (rel) pendingRef.current.add(rel);
      }
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        const changed = [...pendingRef.current];
        pendingRef.current.clear();
        const c = ref.current;
        if (c.paused) return;
        const due = dueAgents(c.agents, changed, c.statuses, Date.now());
        if (due.length) {
          // Each agent only sees the changed files it actually watches.
          for (const a of due) {
            enqueue([a.id], changed.filter((p) => a.watch.some((g) => matchAny([g], p))));
          }
        }
      }, DEBOUNCE_MS);
    });
    return () => {
      off();
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [enqueue]);

  return {
    agents,
    statuses,
    paused,
    setPaused,
    setConfig,
    addCustom,
    removeCustom,
    runNow,
    busy,
  };
}
