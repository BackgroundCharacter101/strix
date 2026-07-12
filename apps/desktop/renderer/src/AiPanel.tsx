import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  runTask,
  complete,
  configureAi,
  buildPrompt,
  parseScaffold,
  type TaskType,
  type ChatMessage,
  type SecurityStance,
  type Attachment,
} from '@strix/ai-gateway';
import { readAttachment, MAX_ATTACH_BYTES } from './attachments';
import { FreebuffPanel } from './FreebuffPanel';
import type { DirectModel } from './useSettings';
import {
  rankFiles,
  formatRepoContext,
  extractMentions,
  resolveMentions,
  tokenize,
  scoreFile,
  type RepoFile,
  type RankedFile,
} from './repoContext';
import {
  activeMention,
  rankMentionCandidates,
  applyMention,
  pinnedFiles,
  removeMention,
} from './mentionAutocomplete';
import { CodeProposal } from './CodeProposal';
import { PromptDialog } from './PromptDialog';
import { SparkleIcon } from './icons';
import { renderMarkdown } from './markdown';
import { showToast } from './toast';
import { isSafeRelPath, pickBuildModel } from '@strix/ai-gateway';
import { DiffViewer, languageForPath } from '@strix/editor';
import { PRESET_AGENTS } from './agents/presets';

// AI history is scoped per workspace so each project keeps its own conversation.
function historyKeyFor(workspaceKey: string | null | undefined): string {
  return `strix.ai.history:${workspaceKey || 'global'}`;
}

function loadHistory(key: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

// A file-tree node (mirrors main/fs.ts FileNode) for building project context.
interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

// Flatten a workspace tree into an indented path listing, capped so we never
// blow the prompt budget on huge repos.
export function flattenTree(root: TreeNode | null, cap = 240): string {
  if (!root) return '';
  const lines: string[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      if (lines.length >= cap) return;
      lines.push(`${'  '.repeat(depth)}${n.name}${n.type === 'directory' ? '/' : ''}`);
      if (n.children && n.children.length) walk(n.children, depth + 1);
    }
  };
  walk(root.children ?? [], 0);
  if (lines.length >= cap) lines.push('… (truncated)');
  return lines.join('\n');
}

// Build the compact "project context" string from a workspace root.
async function loadProjectContext(workspaceKey: string | null | undefined): Promise<string> {
  if (!workspaceKey) return '';
  try {
    const tree = (await window.strix.fs.tree(workspaceKey)) as TreeNode & { name: string };
    const name = tree.name || workspaceKey.split(/[\\/]/).filter(Boolean).pop() || 'workspace';
    const listing = flattenTree(tree);
    return listing ? `Project: ${name}\n${listing}` : `Project: ${name}`;
  } catch {
    return '';
  }
}

// Join a workspace-relative path onto the root using the root's own separator,
// so the absolute path matches what the Explorer/tree produced (no duplicate
// tabs from mixing "/" and "\" on Windows).
function joinUnder(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  const base = root.replace(/[\\/]+$/, '');
  const tail = rel.replace(/[\\/]+/g, sep).replace(new RegExp(`^\\${sep}+`), '');
  return base + sep + tail;
}

// Work out how to run the project the user means: pick the target directory
// (a subfolder named in the message, else the root) and a command from its
// package.json scripts or an obvious entry file. Returns null if unsure.
async function detectRunTarget(
  root: string,
  message: string,
): Promise<{ command: string; cwd: string } | null> {
  let tree: TreeNode;
  try {
    tree = (await window.strix.fs.tree(root)) as TreeNode;
  } catch {
    return null;
  }
  const msg = message.toLowerCase();

  // Find the deepest directory whose name is mentioned in the message.
  let dir = root;
  let dirNode: TreeNode = tree;
  let best = '';
  const walk = (node: TreeNode & { path?: string }) => {
    for (const c of node.children ?? []) {
      if (c.type === 'directory') {
        const n = c.name.toLowerCase();
        if (n.length > best.length && msg.includes(n)) {
          best = n;
          dir = (c as TreeNode & { path: string }).path;
          dirNode = c;
        }
        walk(c as TreeNode & { path?: string });
      }
    }
  };
  walk(tree);

  const children = dirNode.children ?? [];
  const hasFile = (name: string) =>
    children.some((c) => c.type === 'file' && c.name.toLowerCase() === name);

  if (hasFile('package.json')) {
    try {
      const pj = JSON.parse(await window.strix.fs.read(joinUnder(dir, 'package.json'))) as {
        scripts?: Record<string, string>;
        main?: string;
      };
      const s = pj.scripts ?? {};
      if (s.start) return { command: 'npm install && npm start', cwd: dir };
      if (s.dev) return { command: 'npm install && npm run dev', cwd: dir };
      if (s.serve) return { command: 'npm install && npm run serve', cwd: dir };
      if (pj.main) return { command: `npm install && node ${pj.main}`, cwd: dir };
      return { command: 'npm install && npm test', cwd: dir };
    } catch {
      /* fall through to entry-file detection */
    }
  }
  const entries: [string, string][] = [
    ['index.js', 'node index.js'],
    ['server.js', 'node server.js'],
    ['app.js', 'node app.js'],
    ['main.py', 'python main.py'],
    ['app.py', 'python app.py'],
  ];
  for (const [file, cmd] of entries) {
    if (hasFile(file)) return { command: cmd, cwd: dir };
  }
  return null;
}

// Text file extensions worth sending to the agent so it can MODIFY them.
const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|css|scss|less|html|htm|py|rb|php|go|rs|java|kt|c|h|cpp|hpp|cs|sh|bash|yml|yaml|toml|ini|env|sql|xml|svg|vue|svelte|astro|gitignore|dockerfile)$/i;

// Read the project's small text files (capped) as structured {path, content}.
// Used to feed the agent (edits) and to rank repo-wide context for chat.
async function gatherRepoFiles(
  workspaceKey: string,
  opts: { maxFiles?: number; maxBytes?: number; maxFileBytes?: number } = {},
): Promise<RepoFile[]> {
  const maxFiles = opts.maxFiles ?? 24;
  const maxBytes = opts.maxBytes ?? 60_000;
  const maxFileBytes = opts.maxFileBytes ?? 24_000;
  let tree: TreeNode;
  try {
    tree = (await window.strix.fs.tree(workspaceKey)) as TreeNode;
  } catch {
    return [];
  }

  // Collect candidate file paths (absolute) from the tree.
  const paths: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (paths.length >= maxFiles * 3) return;
      if (n.type === 'directory') walk(n.children ?? []);
      else if (TEXT_EXT.test(n.name) || !n.name.includes('.'))
        paths.push((n as TreeNode & { path: string }).path);
    }
  };
  walk(tree.children ?? []);

  const files: RepoFile[] = [];
  let total = 0;
  for (const abs of paths) {
    if (files.length >= maxFiles || total >= maxBytes) break;
    let content = '';
    try {
      content = await window.strix.fs.read(abs);
    } catch {
      continue;
    }
    if (content.length > maxFileBytes) continue;
    const rel = abs.slice(workspaceKey.length).replace(/^[\\/]/, '').replace(/\\/g, '/');
    files.push({ path: rel, content });
    total += content.length;
  }
  return files;
}

// Find the files across the WHOLE repo most relevant to a query and read only
// those (within budget). Unlike gatherRepoFiles (pre-order, capped early), this
// ranks every candidate path by filename relevance first — so on big projects
// with many large folders the AI still sees the right files anywhere in the tree.
async function gatherRelevantFiles(
  workspaceKey: string,
  query: string,
  opts: { maxFiles?: number; maxBytes?: number; maxFileBytes?: number } = {},
): Promise<RepoFile[]> {
  const maxFiles = opts.maxFiles ?? 40;
  const maxBytes = opts.maxBytes ?? 220_000;
  const maxFileBytes = opts.maxFileBytes ?? 16_000;
  let tree: TreeNode;
  try {
    tree = (await window.strix.fs.tree(workspaceKey)) as TreeNode;
  } catch {
    return [];
  }
  // 1) Collect every candidate path cheaply (no content reads), repo-wide.
  const paths: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (paths.length >= 12_000) return;
      if (n.type === 'directory') walk(n.children ?? []);
      else if (TEXT_EXT.test(n.name) || !n.name.includes('.'))
        paths.push((n as TreeNode & { path: string }).path);
    }
  };
  walk(tree.children ?? []);

  // 2) Rank by how well the path/filename matches the query.
  const q = [...new Set(tokenize(query))];
  const scored = paths
    .map((abs) => {
      const rel = abs.slice(workspaceKey.length).replace(/^[\\/]/, '').replace(/\\/g, '/');
      return { abs, rel, score: q.length ? scoreFile(q, { path: rel, content: '' }) : 0 };
    })
    .sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));

  // 3) Read the top candidates within budget (stop once names stop matching).
  const files: RepoFile[] = [];
  let total = 0;
  for (const c of scored) {
    if (files.length >= maxFiles || total >= maxBytes) break;
    if (q.length && c.score === 0 && files.length > 0) break;
    let content = '';
    try {
      content = await window.strix.fs.read(c.abs);
    } catch {
      continue;
    }
    if (content.length > maxFileBytes) continue;
    files.push({ path: c.rel, content });
    total += content.length;
  }
  return files;
}

// Collect every text file's workspace-relative path (no content reads) to feed
// the `@file` typeahead. Cheap: walks the tree only.
async function gatherAllPaths(workspaceKey: string, cap = 4000): Promise<string[]> {
  let tree: TreeNode;
  try {
    tree = (await window.strix.fs.tree(workspaceKey)) as TreeNode;
  } catch {
    return [];
  }
  const out: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (out.length >= cap) return;
      if (n.type === 'directory') walk(n.children ?? []);
      else if (TEXT_EXT.test(n.name) || !n.name.includes('.')) {
        const abs = (n as TreeNode & { path: string }).path;
        out.push(abs.slice(workspaceKey.length).replace(/^[\\/]/, '').replace(/\\/g, '/'));
      }
    }
  };
  walk(tree.children ?? []);
  return out;
}

// Fenced blocks of the project's files (for the build/edit agent prompt).
async function gatherProjectFiles(
  workspaceKey: string,
  opts: { maxFiles?: number; maxBytes?: number; maxFileBytes?: number } = {},
): Promise<string> {
  const files = await gatherRepoFiles(workspaceKey, opts);
  return files.map((f) => `File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
}

export function AiPanel({
  filePath,
  fileContent,
  onApplyEdit,
  onAskClaude,
  selectionRequest,
  seedPrompt,
  freebuffEnv,
  freebuffSeed,
  terminalFontSize,
  terminalFontFamily,
  terminalCursorStyle,
  terminalShell,
  aiServerUrl,
  aiDefaultModel = 'auto',
  aiTemperature = 0.7,
  aiMaxTokens = 0,
  aiDirectModels = [],
  mode = 'normal',
  securityStance = 'balanced',
  onSecurityStanceChange,
  securityPersonaText,
  workspaceKey,
  onConfigure,
  onOpenPath,
  onShowDiff,
  editorTheme,
  autoApply,
  onRunCommand,
}: {
  filePath: string | null;
  fileContent: string;
  onApplyEdit?: (content: string) => void;
  // Workspace root — AI chat history is saved/loaded per project.
  workspaceKey?: string | null;
  // Open Settings at the AI section (to add a provider key) when none exist.
  onConfigure?: () => void;
  // Open a file by absolute path (used after the AI scaffolds a project).
  onOpenPath?: (absPath: string) => void;
  // Show a read-only diff (old vs new) for a pending agent change.
  onShowDiff?: (path: string, original: string, modified: string) => void;
  // Monaco theme name for the inline diffs in the review panel.
  editorTheme?: string;
  // When true, agent file changes are applied immediately (no review modal).
  autoApply?: boolean;
  // Run a shell command the agent suggested, in the integrated terminal.
  onRunCommand?: (command: string) => void;
  // Hand the typed question (+ active file) off to a Claude Code terminal session.
  onAskClaude?: (text: string) => void;
  // Hand the typed question (+ active file) off to a FreeBuff terminal session.
  onAskFreebuff?: (text: string) => void;
  // Run an Explain/Fix on an editor selection (from the floating toolbar).
  selectionRequest?: { nonce: number; kind: 'explain' | 'fix'; selection: string };
  // Text seeded into the composer (e.g. findings handed off from an agent). The
  // user reviews and presses Send — using whichever model the picker is on.
  seedPrompt?: { nonce: number; text: string };
  // FreeBuff (embedded mode): env for its PTY, an optional prompt to seed into
  // the session, and the terminal font/cursor/shell settings.
  freebuffEnv?: Record<string, string>;
  freebuffSeed?: { nonce: number; text: string };
  terminalFontSize?: number;
  terminalFontFamily?: string;
  terminalCursorStyle?: 'block' | 'underline' | 'bar';
  terminalShell?: string;
  // Shared FreeLLMAPI host URL (blank = local server).
  aiServerUrl?: string;
  // AI tuning (from Settings): default model + sampling temperature + max tokens.
  aiDefaultModel?: string;
  aiTemperature?: number;
  aiMaxTokens?: number;
  // User-added direct models (bring-your-own OpenAI-compatible endpoint + key).
  // Selectable in the model picker; picking one streams that request straight to
  // the provider via the main process, no FreeLLMAPI.
  aiDirectModels?: DirectModel[];
  // Workbench mode; 'cybersec' switches the AI to a security-expert persona.
  mode?: 'normal' | 'cybersec';
  // Security-expert stance (only meaningful in cybersec mode).
  securityStance?: SecurityStance;
  onSecurityStanceChange?: (stance: SecurityStance) => void;
  // Resolved persona instructions for the active stance (base + emphasis),
  // possibly user-customized in Settings. Falls back to gateway defaults.
  securityPersonaText?: string;
}) {
  const securityMode = mode === 'cybersec';
  const [input, setInput] = useState('');
  // Files the user attached for the next message (read once, sent as context).
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // `@file` typeahead: all workspace paths + the currently-shown candidates.
  const [allPaths, setAllPaths] = useState<string[]>([]);
  const [mentionItems, setMentionItems] = useState<string[]>([]);
  // `/agent` slash menu — pick a coding agent to run against the project in chat.
  const [slashItems, setSlashItems] = useState<{ id: string; name: string; description: string }[]>(
    [],
  );
  const [slashIndex, setSlashIndex] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  // Which assistant the panel shows: the built-in Strix chat, or FreeBuff
  // embedded in this panel (a real in-panel terminal session). Persisted.
  const [aiMode, setAiMode] = useState<'strix' | 'freebuff'>(() => {
    try {
      return localStorage.getItem('strix.aiMode') === 'freebuff' ? 'freebuff' : 'strix';
    } catch {
      return 'strix';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('strix.aiMode', aiMode);
    } catch {
      /* ignore */
    }
  }, [aiMode]);
  // FreeBuff is mounted lazily on first use, then kept mounted (hidden) so its
  // session survives toggling back to Strix AI.
  const [freebuffStarted, setFreebuffStarted] = useState(aiMode === 'freebuff');
  useEffect(() => {
    if (aiMode === 'freebuff') setFreebuffStarted(true);
  }, [aiMode]);
  // A hand-off (Ask FreeBuff / agent → FreeBuff) switches the panel to FreeBuff.
  const lastFbSeed = useRef(0);
  useEffect(() => {
    if (freebuffSeed && freebuffSeed.nonce > lastFbSeed.current) {
      lastFbSeed.current = freebuffSeed.nonce;
      setAiMode('freebuff');
    }
  }, [freebuffSeed]);
  const [model, setModel] = useState(aiDefaultModel);
  // Agent mode (like Claude Code): 'manual' proposes edits you apply; 'accept'
  // auto-applies (the old autoApply); 'plan' answers with a plan and makes NO
  // file edits until you switch out of Plan. Seeded from the Settings default.
  const [agentMode, setAgentMode] = useState<'manual' | 'accept' | 'plan'>(
    autoApply ? 'accept' : 'manual',
  );
  const autoApplyOn = agentMode === 'accept';
  const planOnly = agentMode === 'plan';
  // Merge the per-session model with the tuned temperature/maxTokens for every
  // AI call (one place so all actions honour Settings → AI).
  const tuned = (signal: AbortSignal) => ({
    model,
    temperature: aiTemperature,
    maxTokens: aiMaxTokens,
    signal,
  });

  // The model picker holds either a FreeLLMAPI model id ('auto', 'gpt-…') or a
  // direct model encoded as `direct:<id>`. When a direct model is selected, that
  // request streams straight to its provider (through the main process, since
  // the renderer can't call external hosts) — no FreeLLMAPI involved.
  const DIRECT_PREFIX = 'direct:';
  const selectedDirect =
    model.startsWith(DIRECT_PREFIX)
      ? aiDirectModels.find((d) => `${DIRECT_PREFIX}${d.id}` === model)
      : undefined;
  const directOn = !!selectedDirect;
  const directIdRef = useRef(0);

  // Mirrors runTask's contract but routes to the selected direct provider when
  // one is chosen in the picker.
  const runTaskAny = (
    task: TaskType,
    opts: Parameters<typeof buildPrompt>[1],
    callbacks: { onToken: (t: string) => void; onDone: (via: string) => void },
    settings: { model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal },
  ): Promise<void> => {
    if (!selectedDirect) return runTask(task, opts, callbacks, settings);
    const direct = selectedDirect;
    return new Promise<void>((resolve, reject) => {
      const id = ++directIdRef.current;
      const messages = buildPrompt(task, opts);
      let settled = false;
      const offs: Array<() => void> = [];
      const signal = settings.signal;
      const cleanup = () => {
        offs.forEach((f) => f());
        if (signal) signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        window.strix.ai.directCancel(id);
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      };
      offs.push(
        window.strix.ai.onDirectToken((p) => {
          if (p.id === id) callbacks.onToken(p.token);
        }),
      );
      offs.push(
        window.strix.ai.onDirectDone((p) => {
          if (p.id === id && !settled) {
            settled = true;
            cleanup();
            callbacks.onDone(direct.label || direct.model);
            resolve();
          }
        }),
      );
      offs.push(
        window.strix.ai.onDirectError((p) => {
          if (p.id === id && !settled) {
            settled = true;
            cleanup();
            reject(new Error(p.error || 'Provider request failed'));
          }
        }),
      );
      if (signal) {
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort);
      }
      // Scaffold plans need headroom; otherwise honour the user's max-tokens cap.
      const maxTokens = task === 'scaffold' ? 4096 : aiMaxTokens || undefined;
      window.strix.ai.directStart(id, {
        baseURL: direct.baseURL,
        apiKey: direct.apiKey,
        model: direct.model,
        messages,
        temperature: task === 'autocomplete' ? undefined : aiTemperature,
        maxTokens,
        provider: direct.provider,
      });
    });
  };

  // Run-and-collect (one-shot) variant of runTaskAny, mirroring complete().
  const completeAny = async (
    task: TaskType,
    opts: Parameters<typeof buildPrompt>[1],
    settings: { model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal },
  ): Promise<string> => {
    if (!selectedDirect) return complete(task, opts, settings);
    let text = '';
    await runTaskAny(task, opts, { onToken: (t) => (text += t), onDone: () => {} }, settings);
    return text;
  };
  const [models, setModels] = useState<string[]>(['auto']);
  const [history, setHistory] = useState<ChatMessage[]>(() =>
    loadHistory(historyKeyFor(workspaceKey)),
  );
  const [streaming, setStreaming] = useState('');
  const [routedVia, setRoutedVia] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<{ original: string; suggested: string } | null>(null);
  // null = unknown/checking; true/false = whether any provider key is configured.
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);
  // Bumped when provider keys change in the Settings overlay (which renders OVER
  // this still-mounted panel, so no remount/focus fires). Re-runs the config,
  // model-list, and hasKeys effects so a freshly added key is picked up at once.
  const [keysNonce, setKeysNonce] = useState(0);
  // Compact whole-project context (name + file tree) so the AI can answer
  // questions about the project even with no file open. Loaded per workspace.
  const [projectContext, setProjectContext] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  // The key the current history belongs to (so saves go to the right project,
  // even right after a workspace switch).
  const histKeyRef = useRef(historyKeyFor(workspaceKey));

  // Lazily boot the local AI server on the first real action so app launch is
  // fast. Flipping serverReady re-runs the config/model effect once it's up.
  const [serverReady, setServerReady] = useState(false);
  const ensureAi = async () => {
    // A selected direct model talks to its provider — no local FreeLLMAPI needed.
    if (directOn) return;
    await window.strix.ai.ensure(aiServerUrl || undefined);
    if (!serverReady) setServerReady(true);
  };

  // Point the AI client at the FreeLLMAPI server (local or a shared host) and
  // load its model list (always — Auto + FreeLLMAPI models stay available in the
  // picker alongside any direct models). Retries a few times while the server
  // boots before settling on just ['auto'].
  useEffect(() => {
    const url = aiServerUrl || undefined;
    let cancelled = false;
    window.strix.ai.config(url).then((c) => !cancelled && configureAi(c));
    let attempts = 0;
    const load = () => {
      window.strix.ai.models(url).then((m) => {
        if (cancelled) return;
        setModels(m);
        if (m.length <= 1 && serverReady && attempts < 4) {
          attempts += 1;
          window.setTimeout(load, 1000);
        }
      });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [aiServerUrl, serverReady, keysNonce]);

  // A provider key added/removed in Settings (an overlay over this panel) fires
  // this window event so we re-fetch config, models, and hasKeys immediately —
  // otherwise the panel would stay stale until an OS window focus or a restart.
  useEffect(() => {
    const onKeysChanged = () => setKeysNonce((n) => n + 1);
    window.addEventListener('strix:ai-keys-changed', onKeysChanged);
    return () => window.removeEventListener('strix:ai-keys-changed', onKeysChanged);
  }, []);

  // Detect whether the AI is usable, so we can prompt the user to configure it.
  // A direct model selected, or any direct model added, or a FreeLLMAPI provider
  // key all count as "configured". Re-checks on server change and window focus.
  useEffect(() => {
    if (directOn || aiDirectModels.length > 0) {
      setHasKeys(true);
      return;
    }
    const url = aiServerUrl || undefined;
    let cancelled = false;
    const check = () => {
      window.strix.ai
        .listKeys(url)
        .then((keys) => {
          if (!cancelled) setHasKeys(keys.length > 0);
        })
        .catch(() => {
          if (!cancelled) setHasKeys(null);
        });
    };
    check();
    window.addEventListener('focus', check);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', check);
    };
  }, [aiServerUrl, directOn, aiDirectModels.length, keysNonce]);

  // Reload the conversation when the workspace changes (per-project chat).
  useEffect(() => {
    const key = historyKeyFor(workspaceKey);
    histKeyRef.current = key;
    setHistory(loadHistory(key));
  }, [workspaceKey]);

  // Load the project structure for the active workspace so chat/explain can see
  // the whole project, not just the open file. Cancels on workspace switch.
  useEffect(() => {
    let cancelled = false;
    void loadProjectContext(workspaceKey).then((ctx) => {
      if (!cancelled) setProjectContext(ctx);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceKey]);

  // Load all workspace file paths for the `@file` typeahead. Cheap (no reads).
  useEffect(() => {
    let cancelled = false;
    if (!workspaceKey) {
      setAllPaths([]);
      return;
    }
    void gatherAllPaths(workspaceKey).then((paths) => {
      if (!cancelled) setAllPaths(paths);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceKey]);

  // Recompute the `@file` typeahead from the composer's current value + caret.
  const refreshMentions = (value: string, caret: number | null) => {
    const active = caret == null ? null : activeMention(value, caret);
    if (!active) {
      setMentionItems([]);
      return;
    }
    setMentionItems(rankMentionCandidates(active.query, allPaths));
    setMentionIndex(0);
  };

  // Accept a typeahead candidate: rewrite the composer text and move the caret.
  const acceptMention = (chosen: string) => {
    const el = composerRef.current;
    const caret = el?.selectionStart ?? input.length;
    const active = activeMention(input, caret);
    if (!active) return;
    const { text, caret: nextCaret } = applyMention(input, active, chosen);
    setInput(text);
    setMentionItems([]);
    // Restore the caret after React re-renders the controlled textarea.
    requestAnimationFrame(() => {
      const node = composerRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  // Files the current `@mentions` resolve to — shown as removable chips so the
  // user can see (and unpin) the extra context they're sending.
  const pinned = useMemo(() => pinnedFiles(input, allPaths), [input, allPaths]);

  // Persist to the current project's key (via the ref, so switching workspaces
  // doesn't write the old conversation into the new project).
  useEffect(() => {
    try {
      localStorage.setItem(histKeyRef.current, JSON.stringify(history));
    } catch {
      /* ignore quota/availability errors */
    }
  }, [history]);

  // Keep the conversation pinned to the latest message as it streams in.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, streaming]);

  const fileReady = filePath !== null;

  // Aborts the current streaming request (the Stop button).
  const abortRef = useRef<AbortController | null>(null);
  const stop = () => abortRef.current?.abort();

  const run = async (task: TaskType) => {
    await ensureAi();
    setBusy(true);
    setStreaming('');
    setRoutedVia(null);
    const userMessage = input;
    const priorHistory = history;
    if (task === 'chat' && (userMessage || attachments.length)) {
      const tag = attachments.length ? ` 📎 ${attachments.map((a) => a.name).join(', ')}` : '';
      setHistory((h) => [...h, { role: 'user', content: `${userMessage}${tag}` }]);
      setInput('');
      setAttachments([]);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // Repo-wide context: for chat/explain, pull the files most relevant to the
    // question and add them to the project context so the AI can reason about
    // the whole codebase (not just the open file + tree).
    let ctx = projectContext;
    if ((task === 'chat' || task === 'explain') && workspaceKey && userMessage.trim()) {
      try {
        // Repo-wide: rank every file by relevance to the question, so big
        // projects with many folders still surface the right files.
        const pool = await gatherRelevantFiles(workspaceKey, userMessage, {
          maxFiles: 40,
          maxBytes: 220_000,
          maxFileBytes: 16_000,
        });
        // Files the user pinned with @path always go in; ranked files fill the rest.
        const pinned = resolveMentions(extractMentions(userMessage), pool);
        const pinnedPaths = new Set(pinned.map((f) => f.path));
        const ranked = rankFiles(
          userMessage,
          pool.filter((f) => !pinnedPaths.has(f.path)),
          { maxFiles: 6, maxBytes: 24_000 },
        );
        const combined: RankedFile[] = [
          ...pinned.map((f) => ({ ...f, score: Number.MAX_SAFE_INTEGER })),
          ...ranked,
        ];
        const block = formatRepoContext(combined);
        if (block) ctx = `${projectContext}\n\n${block}`;
      } catch {
        /* fall back to tree-only context */
      }
    }

    // Plan mode: ask for a plan and forbid edits. Injected via context so the
    // visible user message stays clean.
    const planCtx = planOnly
      ? `${ctx}\n\n[PLAN MODE] Respond with a concise, numbered plan only: the approach, which files you'd change and why. Do NOT output code, diffs, or file edits — the user will switch out of Plan mode to apply anything.`
      : ctx;

    let acc = '';
    try {
      await runTaskAny(
        task,
        { filePath: filePath ?? '', fileContent, userMessage, history: priorHistory, projectContext: planCtx, securityMode, securityStance, securityPersonaText, attachments: task === 'chat' ? attachments : undefined },
        {
          onToken: (token) => {
            acc += token;
            setStreaming(acc);
          },
          onDone: (via) => setRoutedVia(via),
        },
        tuned(controller.signal),
      );
    } catch {
      // Keep whatever streamed so far. Surface real failures (not a manual Stop).
      if (!controller.signal.aborted) {
        showToast('AI request failed — check the AI server / your key.', 'error', 6000);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }

    // Chat turns are part of the shared thread; one-off actions just display.
    if (task === 'chat') {
      setHistory((h) => [...h, { role: 'assistant', content: acc }]);
      setStreaming('');
    }
  };

  // Cybersec: security-audit the WHOLE project (not just the open file). Streams
  // a findings report into the thread.
  const auditProject = async () => {
    if (busy) return;
    if (!workspaceKey) {
      showToast('Open a project folder first.', 'info');
      return;
    }
    await ensureAi();
    setBusy(true);
    setStreaming('');
    setRoutedVia(null);
    setHistory((h) => [...h, { role: 'user', content: '🛡️ Security audit — whole project' }]);
    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    try {
      const project = await gatherProjectFiles(workspaceKey, {
        maxFiles: 60,
        maxBytes: 200_000,
        maxFileBytes: 16_000,
      });
      await runTaskAny(
        'vuln_check',
        {
          filePath: '',
          fileContent: project,
          userMessage:
            'Perform a security audit across this entire project. Group concrete findings by severity (Critical / High / Medium / Low); for each give the file path, the issue, why it is exploitable, and a fix. Cover injection, authentication/authorization, hard-coded secrets, unsafe deserialization, path traversal, SSRF, XSS, crypto misuse, and risky dependencies. End with a short prioritized remediation checklist.',
          securityMode: true,
          securityStance,
          securityPersonaText,
        },
        {
          onToken: (token) => {
            acc += token;
            setStreaming(acc);
          },
          onDone: (via) => setRoutedVia(via),
        },
        tuned(controller.signal),
      );
    } catch {
      if (!controller.signal.aborted) {
        showToast('Audit failed — check the AI server / your key.', 'error', 6000);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
    setHistory((h) => [...h, { role: 'assistant', content: acc }]);
    setStreaming('');
  };

  // Run Explain/Fix on a selected snippet (from the editor's floating toolbar).
  // The request + response are appended to the conversation thread.
  const runSelection = async (kind: 'explain' | 'fix', selection: string) => {
    await ensureAi();
    setBusy(true);
    setStreaming('');
    setRoutedVia(null);
    setHistory((h) => [
      ...h,
      { role: 'user', content: `${kind === 'explain' ? 'Explain' : 'Fix'} this selection:\n${selection}` },
    ]);
    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    try {
      await runTaskAny(
        kind,
        { filePath: filePath ?? '', fileContent: selection, userMessage: '', securityMode, securityStance, securityPersonaText },
        {
          onToken: (token) => {
            acc += token;
            setStreaming(acc);
          },
          onDone: (via) => setRoutedVia(via),
        },
        tuned(controller.signal),
      );
    } catch {
      if (!controller.signal.aborted) {
        showToast('AI request failed — check the AI server / your key.', 'error', 6000);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
    setHistory((h) => [...h, { role: 'assistant', content: acc }]);
    setStreaming('');
  };

  // Trigger a selection action when App raises a new request.
  const lastReq = useRef(0);
  useEffect(() => {
    if (selectionRequest && selectionRequest.nonce > lastReq.current) {
      lastReq.current = selectionRequest.nonce;
      void runSelection(selectionRequest.kind, selectionRequest.selection);
    }
  }, [selectionRequest]);

  // Seed the composer with handed-off text (e.g. an agent's findings) and focus
  // it, so the user can review then Send to the selected model.
  const lastSeed = useRef(0);
  useEffect(() => {
    if (seedPrompt && seedPrompt.nonce > lastSeed.current) {
      lastSeed.current = seedPrompt.nonce;
      setInput(seedPrompt.text);
      requestAnimationFrame(() => {
        const el = composerRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
  }, [seedPrompt]);


  // Re-run the most recent user turn (drops the last assistant reply first).
  const regenerate = async () => {
    let lastUser = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        lastUser = i;
        break;
      }
    }
    if (lastUser === -1 || busy) return;
    await ensureAi();
    const userMessage = history[lastUser].content;
    const prior = history.slice(0, lastUser);
    setHistory(history.slice(0, lastUser + 1));
    setBusy(true);
    setStreaming('');
    setRoutedVia(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    try {
      await runTaskAny(
        'chat',
        { filePath: filePath ?? '', fileContent, userMessage, history: prior, projectContext, securityMode, securityStance, securityPersonaText },
        {
          onToken: (token) => {
            acc += token;
            setStreaming(acc);
          },
          onDone: (via) => setRoutedVia(via),
        },
        tuned(controller.signal),
      );
    } catch {
      if (!controller.signal.aborted) {
        showToast('AI request failed — check the AI server / your key.', 'error', 6000);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
    setHistory((h) => [...h, { role: 'assistant', content: acc }]);
    setStreaming('');
  };

  const canRegenerate = !busy && history.some((m) => m.role === 'assistant');

  // Save a single code block from a reply into the project (filename prompt).
  const [saveReq, setSaveReq] = useState<{ code: string; name: string } | null>(null);
  const onSaveCode = (code: string, suggestedName?: string) => {
    if (!workspaceKey) {
      showToast('Open or create a project first, then save the code.', 'info', 6000);
      return;
    }
    setSaveReq({ code, name: suggestedName ?? '' });
  };
  const writeSavedCode = (relPath: string) => {
    if (!saveReq || !workspaceKey) return;
    if (!isSafeRelPath(relPath)) {
      showToast('That path is not allowed (stay inside the project).', 'error', 5000);
      return;
    }
    const abs = `${workspaceKey}/${relPath}`;
    void window.strix.fs
      .write(abs, saveReq.code)
      .then(() => {
        showToast(`Saved ${relPath}`, 'success');
        onOpenPath?.(abs);
      })
      .catch((e) => showToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, 'error'))
      .finally(() => setSaveReq(null));
  };

  // --- AI project scaffolder ------------------------------------------------
  // Each pending file carries its previous on-disk content (null = new file) so
  // the review modal can show New/Modified and a real diff.
  type ReviewFile = { path: string; content: string; old: string | null; summary?: string };
  const [scaffold, setScaffold] = useState<
    { files: ReviewFile[]; notes?: string; run?: string } | null
  >(null);
  const [applying, setApplying] = useState(false);
  // Which file's inline diff is expanded in the review panel.
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  // Roll-back history (this session): each applied AI batch snapshots the prior
  // contents so it can be reverted. `before === null` means the file was newly
  // created (revert = delete it).
  type RollbackFile = { path: string; before: string | null };
  type RollbackBatch = { id: number; time: number; label: string; files: RollbackFile[] };
  const [rollbacks, setRollbacks] = useState<RollbackBatch[]>([]);
  const [reverting, setReverting] = useState(false);
  // A command to offer running (shown with a Run button; never auto-run).
  const [pendingRun, setPendingRun] = useState<{ command: string; cwd: string } | null>(null);

  // Ask the AI for a whole-project file plan. With no argument it uses the
  // composer text; a descArg drives it programmatically (e.g. an auto-fix).
  const buildProject = async (descArg?: string) => {
    const desc = (descArg ?? input).trim();
    if (!desc || busy) return;
    if (!workspaceKey) {
      showToast('Open or create a project first, then ask me to build it.', 'info', 6000);
      return;
    }
    await ensureAi();
    // Record the request in the thread (like a chat turn) and clear the box.
    const priorHistory = history;
    const atts = attachments;
    const tag = atts.length ? ` 📎 ${atts.map((a) => a.name).join(', ')}` : '';
    setHistory((h) => [
      ...h,
      { role: 'user', content: descArg ? `⚠ ${descArg.split('\n')[0]}` : `${desc}${tag}` },
    ]);
    if (!descArg) {
      setInput('');
      setAttachments([]);
    }
    setBusy(true);
    setStreaming('');
    const controller = new AbortController();
    abortRef.current = controller;
    const buildModel = pickBuildModel(models, model);
    let raw = '';
    try {
      // Step 1 — stream a short plan so the long wait shows real progress.
      let planText = '';
      try {
        await runTaskAny(
          'chat',
          {
            filePath: '',
            fileContent: '',
            userMessage: `In 2-4 short bullet points, say what you'll change to do this — no code:\n${desc}`,
            history: priorHistory,
            projectContext,
            securityMode,
            securityStance,
            securityPersonaText,
          },
          {
            onToken: (t) => {
              planText += t;
              setStreaming(planText);
            },
            onDone: () => {},
          },
          { model: buildModel, signal: controller.signal },
        );
      } catch {
        /* planning is best-effort */
      }
      setStreaming('');
      if (planText.trim()) {
        setHistory((h) => [...h, { role: 'assistant', content: planText }]);
      }

      // Step 2 — generate the actual file plan with full project context.
      const existing = await gatherProjectFiles(workspaceKey);
      const ctx = existing
        ? `${projectContext}\n\nExisting files (use "edits" with exact snippets to change these):\n${existing}`
        : projectContext;
      const buildOpts = { filePath: '', fileContent: '', userMessage: desc, history: priorHistory, projectContext: ctx, securityMode, securityStance, securityPersonaText, attachments: atts };
      try {
        raw = await completeAny('scaffold', buildOpts, { model: buildModel, signal: controller.signal });
      } catch (e1) {
        if (controller.signal.aborted) throw e1;
        // The preferred model may have failed — fall back to the router (auto),
        // which has its own provider failover.
        raw = await completeAny('scaffold', buildOpts, { model: 'auto', signal: controller.signal });
      }
    } catch {
      if (!controller.signal.aborted) {
        showToast('Build request failed — check the AI server / your key.', 'error', 6000);
      }
      setBusy(false);
      abortRef.current = null;
      return;
    }
    setBusy(false);
    abortRef.current = null;
    const plan = parseScaffold(raw);
    if ('error' in plan) {
      // If it looks like a file plan that failed to parse, it was almost
      // certainly truncated (too long) — show a clean message, not raw JSON.
      const looksLikePlan = /^\s*\{[\s\S]*"(files|edits)"\s*:/.test(raw);
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content: looksLikePlan
            ? `⚠ The AI's plan came back incomplete (${plan.error}) — likely too long and cut off. Try again, or ask for a smaller / single-file change.`
            : raw,
        },
      ]);
      return;
    }
    // Enrich full-file entries with their on-disk content (for New/Modified + diff).
    const fileChanges: ReviewFile[] = await Promise.all(
      plan.files.map(async (f) => {
        let old: string | null = null;
        try {
          old = await window.strix.fs.read(joinUnder(workspaceKey, f.path));
        } catch {
          old = null;
        }
        return { path: f.path, content: f.content, old, summary: f.summary };
      }),
    );
    // Apply search/replace edits against the current file contents.
    const editChanges: ReviewFile[] = [];
    const failedEdits: string[] = [];
    for (const e of plan.edits) {
      let old = '';
      try {
        old = await window.strix.fs.read(joinUnder(workspaceKey, e.path));
      } catch {
        failedEdits.push(`${e.path} (not found)`);
        continue;
      }
      if (old.includes(e.search)) {
        editChanges.push({
          path: e.path,
          content: old.replace(e.search, e.replace),
          old,
          summary: e.summary,
        });
      } else {
        failedEdits.push(`${e.path} (snippet not found)`);
      }
    }
    if (failedEdits.length) {
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content: `⚠ Couldn't apply some edits (the snippet didn't match): ${failedEdits.join(', ')}. I'll proceed with the rest — re-ask if one is missing.`,
        },
      ]);
    }
    // Drop unchanged, de-dup by path (edits win over a stray full-file echo).
    const byPath = new Map<string, ReviewFile>();
    for (const f of [...fileChanges, ...editChanges]) {
      if (f.old !== f.content) byPath.set(f.path, f);
    }
    const changed = [...byPath.values()];
    if (changed.length === 0) {
      // No file edits — post the explanation, and offer the run command if any.
      setHistory((h) => [
        ...h,
        { role: 'assistant', content: plan.notes || 'No file changes were needed.' },
      ]);
      if (plan.run && workspaceKey) setPendingRun({ command: plan.run, cwd: workspaceKey });
      return;
    }
    // Accept-edits mode applies immediately; otherwise open the review panel.
    if (autoApplyOn) {
      await applyFiles(changed, plan.notes, plan.run);
    } else {
      setScaffold({ files: changed, notes: plan.notes, run: plan.run });
    }
  };

  // Write a set of pending files to disk, post a summary, and reopen them live.
  const applyFiles = async (files: ReviewFile[], notes?: string, run?: string) => {
    if (!workspaceKey || files.length === 0) return;
    setApplying(true);
    try {
      for (const f of files) {
        await window.strix.fs.write(joinUnder(workspaceKey, f.path), f.content);
      }
      const created = files.filter((f) => f.old === null).length;
      const updated = files.length - created;
      const summary =
        [created ? `${created} new` : '', updated ? `${updated} updated` : '']
          .filter(Boolean)
          .join(', ') || `${files.length} file(s)`;
      // Snapshot prior contents so this batch can be rolled back.
      setRollbacks((rs) => [
        ...rs,
        {
          id: Date.now() + rs.length,
          time: Date.now(),
          label: summary,
          files: files.map((f) => ({ path: f.path, before: f.old })),
        },
      ]);
      showToast(`Applied — ${summary}.`, 'success');
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content:
            (notes ? `${notes}\n\n` : '') +
            `Done — ${summary}:\n` +
            files
              .map(
                (f) =>
                  `- ${f.old === null ? '🆕' : '✏️'} **${f.path}**` +
                  (f.summary ? ` — ${f.summary}` : ''),
              )
              .join('\n'),
        },
      ]);
      // Reopen the changed files (capped) so edits show live; reversed so the
      // first ends up active. Paths use the workspace separator (no dup tabs).
      const toOpen = files.slice(0, 8).map((f) => joinUnder(workspaceKey, f.path));
      toOpen.reverse().forEach((p) => onOpenPath?.(p));
      setScaffold(null);
      setExpandedFile(null);
      if (run && workspaceKey) {
        const pending = { command: run, cwd: workspaceKey };
        setPendingRun(pending);
        // Hands-off + mid auto-fix: re-run immediately to continue the loop.
        // Otherwise the user reviews then clicks Run.
        if (autoApplyOn && autoFixRound.current > 0) {
          setTimeout(() => void runPendingRef.current(pending), 400);
        }
      }
    } catch (e) {
      showToast(`Write failed: ${e instanceof Error ? e.message : String(e)}`, 'error', 7000);
    } finally {
      setApplying(false);
    }
  };

  const applyScaffold = () => {
    if (scaffold) void applyFiles(scaffold.files, scaffold.notes, scaffold.run);
  };

  // Roll back an applied AI batch: restore each file's prior content, or delete
  // files the batch had newly created. Reopens the modified files so the editor
  // reflects the revert.
  const revertBatch = async (id: number) => {
    const batch = rollbacks.find((b) => b.id === id);
    if (!batch || !workspaceKey || reverting) return;
    setReverting(true);
    try {
      for (const f of batch.files) {
        const abs = joinUnder(workspaceKey, f.path);
        if (f.before === null) {
          await window.strix.fs.remove(abs).catch(() => {});
        } else {
          await window.strix.fs.write(abs, f.before);
        }
      }
      // Reopen only the files that still exist (skip the ones we deleted).
      batch.files
        .filter((f) => f.before !== null)
        .slice(0, 8)
        .forEach((f) => onOpenPath?.(joinUnder(workspaceKey, f.path)));
      setRollbacks((rs) => rs.filter((b) => b.id !== id));
      showToast(`Rolled back — ${batch.label}.`, 'success');
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content: `Rolled back ${batch.files.length} file(s) (${batch.label}).`,
        },
      ]);
    } catch (e) {
      showToast(`Roll back failed: ${e instanceof Error ? e.message : String(e)}`, 'error', 7000);
    } finally {
      setReverting(false);
    }
  };

  // Errors that don't always set a non-zero exit code (a script can print an
  // error and still exit 0) — so we scan the output too.
  const OUTPUT_ERROR_RE =
    /\b(traceback|exception|modulenotfound|no such file|not recognized|command not found|cannot find|is not defined|referenceerror|syntaxerror|typeerror|segmentation fault|fatal error|unhandled|panic:)\b|(^|\n)\s*error[: ]/i;
  // Missing-tool / environment errors — NOT fixable by editing code, so the
  // auto-fix loop stops instead of retrying identically.
  const ENV_ERROR_RE =
    /is not recognized as an internal or external command|command not found|: not found|no such file or directory.*(docker|npm|node|python|yarn|pnpm)|is not installed|could not be found|EACCES|permission denied/i;
  const MAX_AUTOFIX = 3;
  const autoFixRound = useRef(0);

  // Run a suggested command, capture output, and on FAILURE (non-zero exit OR an
  // error in the output) auto-propose a fix + retry — a bounded loop (MAX_AUTOFIX
  // rounds). With "apply without confirming" on, the whole loop runs hands-off;
  // otherwise each fix waits for your approval, then Run continues the loop.
  const runPending = async (override?: { command: string; cwd: string }) => {
    const pr = override ?? pendingRun;
    if (!pr || busy) return;
    const { command: cmd, cwd } = pr;
    setPendingRun(null);
    setBusy(true);
    let res: { exitCode: number; output: string };
    try {
      res = await window.strix.terminal.exec(cmd, cwd);
    } catch {
      setBusy(false);
      showToast('Could not run the command.', 'error');
      return;
    }
    setBusy(false);
    const out = (res.output || '').slice(-4000);
    const ok = res.exitCode === 0 && !OUTPUT_ERROR_RE.test(out);
    setHistory((h) => [
      ...h,
      {
        role: 'assistant',
        content:
          `${ok ? '✅' : '⚠️'} Ran \`${cmd}\` — exit code ${res.exitCode}${res.exitCode === 0 && !ok ? ' (but the output shows errors)' : ''}.\n\n` +
          '```\n' +
          (out || '(no output)') +
          '\n```',
      },
    ]);
    if (ok) {
      autoFixRound.current = 0;
      return;
    }
    // Environment failures (a tool isn't installed / not on PATH) can't be fixed
    // by editing project code — retrying the same command 3× is pointless. Stop
    // immediately with actionable advice instead of burning the loop.
    if (ENV_ERROR_RE.test(out)) {
      autoFixRound.current = 0;
      const tool = out.match(/'([^']+)'\s+is not recognized/i)?.[1] || /(\w[\w-]*)\s*:?\s*command not found/i.exec(out)?.[1];
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content:
            `⚠️ This isn't a code bug — **${tool ? `\`${tool}\`` : 'a required tool'} isn't installed or on your PATH**, so no code change will fix it.\n\n` +
            (tool && /docker/i.test(tool)
              ? 'This project uses Docker. Either install **Docker Desktop** and retry, or — if it just needs to be served — I can start it a simpler way (e.g. `npm install` then `npm run dev`). Want me to try the non-Docker path?'
              : `Install ${tool ? `\`${tool}\`` : 'the missing tool'} (or add it to PATH) and run again, or ask me for an approach that doesn't need it.`),
        },
      ]);
      return;
    }
    if (autoFixRound.current >= MAX_AUTOFIX) {
      autoFixRound.current = 0;
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content: `Stopped auto-fixing after ${MAX_AUTOFIX} attempts — the command still fails. Take a look, or ask me for a different approach.`,
        },
      ]);
      return;
    }
    autoFixRound.current += 1;
    // The agent sees the failure and proposes a fix. applyFiles re-runs the
    // command automatically (hands-off mode) to continue the loop.
    await buildProject(
      `The command \`${cmd}\` failed (exit ${res.exitCode}) — attempt ${autoFixRound.current} of ${MAX_AUTOFIX}. Output:\n${out}\n\n` +
        'Diagnose and fix the project so this command succeeds, then set the corrected "run" command to retry.',
    );
  };
  const runPendingRef = useRef(runPending);
  runPendingRef.current = runPending;

  const clearHistory = () => {
    setHistory([]);
    setStreaming('');
    setRoutedVia(null);
  };

  // A pure question / explanation request — answered as chat (with streaming).
  // Everything else, in an open project, goes to the file-editing agent.
  const isQuestion = (text: string): boolean => {
    const t = text.trim();
    return (
      /\?\s*$/.test(t) ||
      /^(how|what|why|where|when|which|who|whose|can|could|do|does|did|is|are|am|was|were|should|would|will|explain|show me|tell me|describe|list|summari|review|look at|why|help me understand)\b/i.test(
        t,
      )
    );
  };

  // A "run/start the project" request (and not a build/edit request).
  const isRunIntent = (text: string): boolean => {
    const t = ` ${text.toLowerCase()} `;
    if (
      /\b(make|create|build|add|implement|generate|write|refactor|fix|change|update|modify|enhance|improve)\b/.test(
        t,
      )
    )
      return false;
    return /\b(run|start|launch|execute)\b/.test(t);
  };

  // Resolve the run command for the named project and offer to run it.
  const handleRun = async (text: string) => {
    if (!workspaceKey) return;
    const target = await detectRunTarget(workspaceKey, text);
    if (!target) {
      void buildProject(text); // couldn't work it out — let the agent try
      return;
    }
    const rel = target.cwd.slice(workspaceKey.length).replace(/^[\\/]/, '') || '.';
    setHistory((h) => [
      ...h,
      { role: 'user', content: text },
      {
        role: 'assistant',
        content: `I'll run \`${target.command}\` in \`${rel}\`. Click **Run & check** to run it in the terminal — I'll watch the output and offer a fix if it errors.`,
      },
    ]);
    setInput('');
    setPendingRun(target);
  };

  // Read picked/dropped files into attachments for the next message.
  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      if (file.size > MAX_ATTACH_BYTES) {
        showToast(`${file.name} is too large (max 10 MB).`, 'error', 5000);
        continue;
      }
      try {
        const att = await readAttachment(file);
        setAttachments((a) => [...a, att]);
      } catch {
        showToast(`Could not read ${file.name}.`, 'error');
      }
    }
  };

  // Send: in an open project, route to run / agent-edit / chat by intent.
  // Edit a previous message: load it into the composer and truncate the thread
  // to before it, so re-sending replaces that turn onward (VS Code-style).
  const editTurn = (i: number) => {
    const msg = history[i];
    if (!msg || msg.role !== 'user' || busy) return;
    setInput(String(msg.content));
    setHistory(history.slice(0, i));
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  // Delete a turn (and its assistant reply, if the next message is one).
  const deleteTurn = (i: number) => {
    if (busy) return;
    setHistory(history.filter((_, idx) => idx !== i && !(idx === i + 1 && history[i + 1]?.role === 'assistant')));
  };

  const send = () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    if (text && workspaceKey && isRunIntent(text)) {
      void handleRun(text);
    } else if (text && workspaceKey && !isQuestion(text) && attachments.length === 0) {
      void buildProject();
    } else {
      void run('chat');
    }
  };
  // Ref so the slash-run can send() after setInput commits (send() reads `input`).
  const sendRef = useRef(send);
  sendRef.current = send;

  // `/` slash menu: filter the coding agents by what's typed after the slash.
  const refreshSlash = (value: string) => {
    if (!value.startsWith('/')) {
      if (slashItems.length) setSlashItems([]);
      return;
    }
    const q = value.slice(1).toLowerCase();
    const items = PRESET_AGENTS.filter(
      (a) => a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    ).map((a) => ({ id: a.id, name: a.name, description: a.description }));
    setSlashItems(items);
    setSlashIndex(0);
  };

  // Run a picked agent in chat: seed a task from its persona and send it. The
  // chat path gathers project context, so the AI reviews the whole project.
  const runAgent = (agent: { id: string; name: string; description: string }) => {
    setSlashItems([]);
    setInput(`Act as the "${agent.name}" agent — ${agent.description} Review the project and report your findings.`);
    setTimeout(() => sendRef.current(), 0);
  };

  return (
    <section
      className="ai-pane-content"
      aria-label="AI chat"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          void addFiles(e.dataTransfer.files);
        }
      }}
    >
      <header className="ai-pane-header">
        <span className="ai-pane-title">
          <SparkleIcon size={15} />
          AI Assistant
        </span>
        <div className="ai-mode-toggle" role="tablist" aria-label="AI mode">
          <button
            type="button"
            role="tab"
            aria-selected={aiMode === 'strix'}
            className={aiMode === 'strix' ? 'is-active' : ''}
            onClick={() => setAiMode('strix')}
          >
            Strix AI
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aiMode === 'freebuff'}
            className={aiMode === 'freebuff' ? 'is-active' : ''}
            onClick={() => setAiMode('freebuff')}
          >
            FreeBuff
          </button>
        </div>
        {aiMode === 'strix' && (
          <button
            type="button"
            className="ai-ghost-btn"
            onClick={clearHistory}
            disabled={busy || history.length === 0}
          >
            Clear
          </button>
        )}
      </header>

      {aiMode === 'strix' && (
        <>
      <div className="ai-toolbar">
        <select aria-label="model" value={model} onChange={(e) => setModel(e.target.value)}>
          {aiDirectModels.length > 0 ? (
            <optgroup label="FreeLLMAPI">
              {models.map((m) => (
                <option key={m} value={m}>
                  {m === 'auto' ? 'Auto (router)' : m}
                </option>
              ))}
            </optgroup>
          ) : (
            models.map((m) => (
              <option key={m} value={m}>
                {m === 'auto' ? 'Auto (router)' : m}
              </option>
            ))
          )}
          {aiDirectModels.length > 0 && (
            <optgroup label="Direct API keys">
              {aiDirectModels.map((d) => (
                <option key={d.id} value={`${DIRECT_PREFIX}${d.id}`}>
                  {d.label || d.model}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {/* Always show the model answering in this session: the direct model /
            picked FreeLLMAPI model, or on Auto the one the router last used. */}
        <span className="ai-routed-chip" title="AI model answering in this session">
          {selectedDirect
            ? selectedDirect.label || selectedDirect.model
            : model !== 'auto'
              ? model
              : routedVia && routedVia !== 'unknown'
                ? routedVia
                : 'Auto · router'}
        </span>
        {/* Agent mode: how the AI's file changes are handled. */}
        <span className="ai-mode" role="radiogroup" aria-label="Agent mode">
          {(
            [
              ['manual', 'Manual', 'Propose edits — you apply them'],
              ['accept', 'Accept edits', 'Auto-apply the AI’s edits'],
              ['plan', 'Plan', 'Plan only — makes no file edits'],
            ] as const
          ).map(([m, label, title]) => (
            <button
              key={m}
              type="button"
              className={`ai-mode-btn${agentMode === m ? ' is-active' : ''}`}
              role="radio"
              aria-checked={agentMode === m}
              title={title}
              onClick={() => setAgentMode(m)}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      {hasKeys === false && (
        <div className="ai-config-banner" role="status">
          <div className="ai-config-text">
            <strong>AI not configured</strong>
            <span>Add a provider key (Groq, Gemini, OpenRouter… are free) to start chatting.</span>
          </div>
          {onConfigure && (
            <button type="button" className="ai-config-btn" onClick={onConfigure}>
              Add a key
            </button>
          )}
        </div>
      )}

      {securityMode && (
        <div className="ai-stance" role="group" aria-label="security AI stance">
          {(['offensive', 'balanced', 'defensive'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`ai-stance-btn${securityStance === s ? ' is-active' : ''}`}
              aria-pressed={securityStance === s}
              title={`Security AI stance: ${s}`}
              onClick={() => onSecurityStanceChange?.(s)}
            >
              {s === 'offensive' ? '🗡 Offensive' : s === 'defensive' ? '🛡 Defensive' : '⚖ Balanced'}
            </button>
          ))}
          <button
            type="button"
            className="ai-audit-btn"
            title="Security-audit the whole project"
            disabled={busy || !workspaceKey}
            onClick={() => void auditProject()}
          >
            🛡 Audit project
          </button>
        </div>
      )}

      {proposal ? (
        <CodeProposal
          path={filePath}
          original={proposal.original}
          suggested={proposal.suggested}
          onApply={() => {
            onApplyEdit?.(proposal.suggested);
            setProposal(null);
          }}
          onDismiss={() => setProposal(null)}
        />
      ) : scaffold ? (
        <div className="ai-review" aria-label="Review changes">
          <div className="ai-review-head">
            <strong>Review changes — {scaffold.files.length} file(s)</strong>
            {scaffold.notes && <p className="scaffold-notes">{scaffold.notes}</p>}
          </div>
          <ul className="scaffold-list">
            {scaffold.files.map((f) => {
              const open = expandedFile === f.path;
              return (
                <li key={f.path} className="scaffold-file">
                  <button
                    type="button"
                    className="scaffold-row"
                    aria-expanded={open}
                    onClick={() => setExpandedFile(open ? null : f.path)}
                  >
                    <span className="scaffold-caret">{open ? '▾' : '▸'}</span>
                    <span className={`scaffold-badge ${f.old === null ? 'is-new' : 'is-mod'}`}>
                      {f.old === null ? 'NEW' : 'MOD'}
                    </span>
                    <span className="scaffold-main">
                      <span className="scaffold-path">{f.path}</span>
                      {f.summary && <span className="scaffold-summary">{f.summary}</span>}
                    </span>
                    {onShowDiff && (
                      <span
                        className="scaffold-diff-btn"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowDiff(f.path, f.old ?? '', f.content);
                        }}
                      >
                        Open ↗
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="scaffold-diff">
                      <DiffViewer
                        original={f.old ?? ''}
                        modified={f.content}
                        language={languageForPath(f.path)}
                        theme={editorTheme}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="ai-review-actions">
            <button
              type="button"
              className="ai-ghost-btn"
              onClick={() => setScaffold(null)}
              disabled={applying}
            >
              Cancel
            </button>
            <button type="button" onClick={() => void applyScaffold()} disabled={applying}>
              {applying ? 'Applying…' : 'Apply changes'}
            </button>
          </div>
        </div>
      ) : (
        <div className="ai-thread" aria-label="AI conversation" ref={threadRef}>
          {history.length === 0 && !streaming ? (
            <div className="ai-empty">
              <SparkleIcon size={26} />
              <p>Ask anything about your code.</p>
              <p className="ai-empty-hint">
                Chat to explain, fix or refactor — pick a mode above (Manual /
                Accept edits / Plan). Type <strong>/</strong> to call an agent.
              </p>
            </div>
          ) : (
            <>
              {history.map((m, i) => (
                <div key={i} className={`ai-row ai-row-${m.role}`}>
                  {m.role === 'assistant' && (
                    <span className="ai-avatar" aria-hidden="true">
                      <SparkleIcon size={13} />
                    </span>
                  )}
                  <div className={`ai-msg ai-${m.role}`}>
                    {m.role === 'assistant' ? (
                      <div className="ai-md">{renderMarkdown(m.content, { onSaveCode })}</div>
                    ) : (
                      m.content
                    )}
                  </div>
                  {m.role === 'user' && !busy && (
                    <div className="ai-msg-actions">
                      <button
                        type="button"
                        title="Edit & resend from here"
                        aria-label="Edit message"
                        onClick={() => editTurn(i)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        title="Delete this message"
                        aria-label="Delete message"
                        onClick={() => deleteTurn(i)}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {streaming && (
                <div className="ai-row ai-row-assistant">
                  <span className="ai-avatar" aria-hidden="true">
                    <SparkleIcon size={13} />
                  </span>
                  <div className="ai-msg ai-assistant">
                    <div className="ai-md">{renderMarkdown(streaming, { onSaveCode })}</div>
                  </div>
                </div>
              )}
              {busy && !streaming && (
                <div className="ai-row ai-row-assistant" aria-label="Assistant is thinking">
                  <span className="ai-avatar" aria-hidden="true">
                    <SparkleIcon size={13} />
                  </span>
                  <div className="ai-msg ai-assistant ai-thinking">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {(routedVia || canRegenerate) && (
        <div className="ai-routed">
          {routedVia && <span>Routed via: {routedVia}</span>}
          {canRegenerate && (
            <button type="button" className="ai-regen-btn" onClick={regenerate}>
              ↻ Regenerate
            </button>
          )}
        </div>
      )}

      {pendingRun && (
        <div className="ai-run-bar">
          <code className="ai-run-cmd" title={pendingRun.command}>
            ▶ {pendingRun.command}
          </code>
          <div className="ai-run-actions">
            <button type="button" className="ai-ghost-btn" onClick={() => setPendingRun(null)}>
              Dismiss
            </button>
            {onRunCommand && (
              <button
                type="button"
                className="ai-ghost-btn"
                title="Run in the integrated terminal (output not analysed)"
                onClick={() => {
                  const { command, cwd } = pendingRun;
                  // PowerShell (the default Windows shell) rejects `&&`; use `;`.
                  const safe = command.replace(/\s*&&\s*/g, '; ');
                  onRunCommand(
                    workspaceKey && cwd !== workspaceKey ? `cd "${cwd}"; ${safe}` : safe,
                  );
                  setPendingRun(null);
                }}
              >
                Terminal ↗
              </button>
            )}
            <button
              type="button"
              className="ai-run-go"
              disabled={busy}
              onClick={() => void runPending()}
              title="Run and let the AI read the output (auto-fixes on error)"
            >
              Run &amp; check
            </button>
          </div>
        </div>
      )}

      {rollbacks.length > 0 && (
        <div className="ai-rollback" aria-label="AI changes — roll back">
          <div className="ai-rollback-head">
            <span>↩ AI changes ({rollbacks.length})</span>
          </div>
          <ul className="ai-rollback-list">
            {[...rollbacks].reverse().map((b) => (
              <li key={b.id} className="ai-rollback-row">
                <span className="ai-rollback-info" title={b.files.map((f) => f.path).join('\n')}>
                  <span className="ai-rollback-label">{b.label}</span>
                  <span className="ai-rollback-time">
                    {new Date(b.time).toLocaleTimeString()}
                  </span>
                </span>
                <button
                  type="button"
                  className="ai-ghost-btn"
                  disabled={reverting}
                  title={`Revert these ${b.files.length} file(s) to their state before this change`}
                  onClick={() => void revertBatch(b.id)}
                >
                  Revert
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="ai-composer">
        {pinned.length > 0 && (
          <div className="ai-pinned" aria-label="pinned files">
            {pinned.map((f) => (
              <span key={f.path} className="ai-chip ai-pin-chip" title={f.path}>
                <span className="ai-chip-icon">@</span>
                <span className="ai-chip-name">{f.path}</span>
                <button
                  type="button"
                  className="ai-chip-x"
                  aria-label={`unpin ${f.path}`}
                  onClick={() => setInput((t) => removeMention(t, f.mention))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="ai-attachments" aria-label="attachments">
            {attachments.map((a, i) => (
              <span key={`${a.name}-${i}`} className="ai-chip">
                <span className="ai-chip-icon">{a.imageUrl ? '🖼' : '📄'}</span>
                <span className="ai-chip-name">{a.name}</span>
                <button
                  type="button"
                  className="ai-chip-x"
                  aria-label={`remove ${a.name}`}
                  onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          aria-hidden="true"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="ai-mention-wrap">
          {slashItems.length > 0 && (
            <ul className="ai-mention-menu ai-slash-menu" role="listbox" aria-label="Agents">
              {slashItems.map((a, i) => (
                <li
                  key={a.id}
                  role="option"
                  aria-selected={i === slashIndex}
                  className={`ai-mention-item${i === slashIndex ? ' active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    runAgent(a);
                  }}
                  onMouseEnter={() => setSlashIndex(i)}
                >
                  <span className="ai-slash-name">/{a.id}</span>
                  <span className="ai-slash-desc">{a.name} — {a.description}</span>
                </li>
              ))}
            </ul>
          )}
          {mentionItems.length > 0 && (
            <ul className="ai-mention-menu" role="listbox" aria-label="File suggestions">
              {mentionItems.map((p, i) => (
                <li
                  key={p}
                  role="option"
                  aria-selected={i === mentionIndex}
                  className={`ai-mention-item${i === mentionIndex ? ' active' : ''}`}
                  // onMouseDown (not onClick) so it fires before the textarea blurs.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    acceptMention(p);
                  }}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  {p}
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={composerRef}
            aria-label="Ask AI"
            placeholder="Ask, say what to build, @file to pin context, or attach files…  (Enter to send)"
            // Native spell-check (red underline + right-click suggestions, wired
            // to the system dictionary by the main process). autoCorrect/
            // autoCapitalize hint the platform's text correction where supported.
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              refreshMentions(e.target.value, e.target.selectionStart);
              refreshSlash(e.target.value);
            }}
            onKeyDown={(e) => {
              // When the /agent menu is open, arrow/enter/esc keys drive it.
              if (slashItems.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSlashIndex((i) => (i + 1) % slashItems.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSlashIndex((i) => (i - 1 + slashItems.length) % slashItems.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  runAgent(slashItems[slashIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSlashItems([]);
                  return;
                }
              }
              // When the @file menu is open, the arrow/enter/tab/esc keys drive it.
              if (mentionItems.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionItems.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  acceptMention(mentionItems[mentionIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setMentionItems([]);
                  return;
                }
              }
              // Enter sends; Shift+Enter inserts a newline.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            // Recompute candidates as the caret moves (clicks, arrow keys).
            onKeyUp={(e) => {
              if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
              refreshMentions(e.currentTarget.value, e.currentTarget.selectionStart);
            }}
            onClick={(e) => refreshMentions(e.currentTarget.value, e.currentTarget.selectionStart)}
            onBlur={() => {
              setMentionItems([]);
              setSlashItems([]);
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
          />
        </div>
        <div className="ai-actions">
          <button
            type="button"
            className="ai-attach-btn"
            title="Attach files (images, PDFs, Markdown, code)"
            aria-label="Attach files"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            📎
          </button>
          {busy ? (
            <button
              type="button"
              className="ai-primary-btn ai-stop-btn"
              onClick={stop}
              aria-label="Stop generating"
            >
              ■ Stop
            </button>
          ) : (
            <button
              type="button"
              className="ai-primary-btn"
              onClick={send}
              disabled={input.length === 0 && attachments.length === 0}
            >
              Send
            </button>
          )}
        </div>
        {onAskClaude && (
          <button
            type="button"
            className="ai-agent-btn ai-claude-btn"
            title="Open Claude Code in the terminal with this question and file"
            disabled={input.trim().length === 0 && !fileReady}
            onClick={() => onAskClaude(input)}
          >
            <SparkleIcon size={13} /> Ask Claude Code
          </button>
        )}
      </div>

      {saveReq && (
        <PromptDialog
          title="Save code as (path in project)"
          initialValue={saveReq.name}
          confirmLabel="Save"
          onSubmit={writeSavedCode}
          onCancel={() => setSaveReq(null)}
        />
      )}
        </>
      )}
      {/* FreeBuff stays mounted once opened (hidden in Strix mode) so toggling
          back doesn't kill the PTY / start a new session. */}
      {freebuffStarted && (
        <div
          className="freebuff-host"
          style={{ display: aiMode === 'freebuff' ? 'flex' : 'none' }}
        >
          <FreebuffPanel
            cwd={workspaceKey ?? undefined}
            env={freebuffEnv}
            seed={freebuffSeed}
            fontSize={terminalFontSize}
            fontFamily={terminalFontFamily}
            cursorStyle={terminalCursorStyle}
            shell={terminalShell}
          />
        </div>
      )}
    </section>
  );
}
