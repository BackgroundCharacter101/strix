import React, { useEffect, useRef, useState } from 'react';
import {
  runTask,
  complete,
  configureAi,
  parseScaffold,
  type TaskType,
  type ChatMessage,
  type SecurityStance,
  type Attachment,
} from '@strix/ai-gateway';
import { readAttachment, MAX_ATTACH_BYTES } from './attachments';
import {
  rankFiles,
  formatRepoContext,
  extractMentions,
  resolveMentions,
  type RepoFile,
  type RankedFile,
} from './repoContext';
import { activeMention, rankMentionCandidates, applyMention } from './mentionAutocomplete';
import { CodeProposal } from './CodeProposal';
import { PromptDialog } from './PromptDialog';
import { SparkleIcon } from './icons';
import { renderMarkdown } from './markdown';
import { showToast } from './toast';
import { isSafeRelPath, pickBuildModel } from '@strix/ai-gateway';
import { DiffViewer, languageForPath } from '@strix/editor';

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
  onAskFreebuff,
  selectionRequest,
  aiServerUrl,
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
  // Shared FreeLLMAPI host URL (blank = local server).
  aiServerUrl?: string;
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
  const [mentionIndex, setMentionIndex] = useState(0);
  const [model, setModel] = useState('auto');
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
  // Compact whole-project context (name + file tree) so the AI can answer
  // questions about the project even with no file open. Loaded per workspace.
  const [projectContext, setProjectContext] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  // The key the current history belongs to (so saves go to the right project,
  // even right after a workspace switch).
  const histKeyRef = useRef(historyKeyFor(workspaceKey));

  // Point the AI client at the FreeLLMAPI server (local or a shared host) and
  // load its model list. Re-runs if the server URL changes in Settings.
  useEffect(() => {
    const url = aiServerUrl || undefined;
    window.strix.ai.config(url).then(configureAi);
    window.strix.ai.models(url).then(setModels);
  }, [aiServerUrl]);

  // Detect whether any provider key is configured, so we can prompt the user to
  // add one. Re-checks when the server changes and when the window regains focus
  // (e.g. right after adding a key in Settings).
  useEffect(() => {
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
  }, [aiServerUrl]);

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
        const pool = await gatherRepoFiles(workspaceKey, {
          maxFiles: 60,
          maxBytes: 200_000,
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

    let acc = '';
    try {
      await runTask(
        task,
        { filePath: filePath ?? '', fileContent, userMessage, history: priorHistory, projectContext: ctx, securityMode, securityStance, securityPersonaText, attachments: task === 'chat' ? attachments : undefined },
        {
          onToken: (token) => {
            acc += token;
            setStreaming(acc);
          },
          onDone: (via) => setRoutedVia(via),
        },
        { model, signal: controller.signal },
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

  // Run Explain/Fix on a selected snippet (from the editor's floating toolbar).
  // The request + response are appended to the conversation thread.
  const runSelection = async (kind: 'explain' | 'fix', selection: string) => {
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
      await runTask(
        kind,
        { filePath: filePath ?? '', fileContent: selection, userMessage: '', securityMode, securityStance, securityPersonaText },
        {
          onToken: (token) => {
            acc += token;
            setStreaming(acc);
          },
          onDone: (via) => setRoutedVia(via),
        },
        { model, signal: controller.signal },
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

  // Fix (§8.4) / Refactor (§8.6): ask for the full updated file, show a diff.
  const propose = async (task: TaskType) => {
    setBusy(true);
    setProposal(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const suggested = await complete(
        task,
        {
          filePath: filePath ?? '',
          fileContent,
          userMessage: 'Return the full updated file. Code only, no explanation or fences.',
          securityMode,
          securityStance,
          securityPersonaText,
        },
        { model, signal: controller.signal },
      );
      if (suggested.trim()) setProposal({ original: fileContent, suggested });
    } catch {
      if (!controller.signal.aborted) {
        showToast('AI request failed — check the AI server / your key.', 'error', 6000);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

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
      await runTask(
        'chat',
        { filePath: filePath ?? '', fileContent, userMessage, history: prior, projectContext, securityMode, securityStance, securityPersonaText },
        {
          onToken: (token) => {
            acc += token;
            setStreaming(acc);
          },
          onDone: (via) => setRoutedVia(via),
        },
        { model, signal: controller.signal },
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
        await runTask(
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
        raw = await complete('scaffold', buildOpts, { model: buildModel, signal: controller.signal });
      } catch (e1) {
        if (controller.signal.aborted) throw e1;
        // The preferred model may have failed — fall back to the router (auto),
        // which has its own provider failover.
        raw = await complete('scaffold', buildOpts, { model: 'auto', signal: controller.signal });
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
    // Hands-off mode applies immediately; otherwise open the review panel.
    if (autoApply) {
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
      if (run && workspaceKey) setPendingRun({ command: run, cwd: workspaceKey });
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

  // Run the agent's suggested command (with the user's click), capture its
  // output, show it in the thread, and on failure auto-propose a fix.
  const runPending = async () => {
    const pr = pendingRun;
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
    const ok = res.exitCode === 0;
    setHistory((h) => [
      ...h,
      {
        role: 'assistant',
        content:
          `${ok ? '✅' : '❌'} Ran \`${cmd}\` — exit code ${res.exitCode}.\n\n` +
          '```\n' +
          (out || '(no output)') +
          '\n```',
      },
    ]);
    if (!ok) {
      // The agent sees the failure and proposes a fix (which the user approves).
      await buildProject(
        `The command \`${cmd}\` failed with exit code ${res.exitCode}. Output:\n${out}\n\n` +
          'Fix the project so this command succeeds, then provide the corrected "run" command to retry.',
      );
    }
  };

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
        <button
          type="button"
          className="ai-ghost-btn"
          onClick={clearHistory}
          disabled={busy || history.length === 0}
        >
          Clear
        </button>
      </header>

      <div className="ai-toolbar">
        <select aria-label="model" value={model} onChange={(e) => setModel(e.target.value)}>
          {models.map((m) => (
            <option key={m} value={m}>
              {m === 'auto' ? 'Auto (router)' : m}
            </option>
          ))}
        </select>
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
                {fileReady
                  ? 'Use Explain, Check security, Fix or Refactor on the open file.'
                  : 'Open a file to unlock the per-file actions below.'}
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
            }}
            onKeyDown={(e) => {
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
            onBlur={() => setMentionItems([])}
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
        <div className="ai-actions ai-file-actions">
          <button type="button" onClick={() => run('explain')} disabled={busy || !fileReady}>
            Explain
          </button>
          <button type="button" onClick={() => run('vuln_check')} disabled={busy || !fileReady}>
            Check security
          </button>
          <button type="button" onClick={() => propose('fix')} disabled={busy || !fileReady}>
            Fix
          </button>
          <button type="button" onClick={() => propose('refactor')} disabled={busy || !fileReady}>
            Refactor
          </button>
        </div>
        {onAskFreebuff && (
          <button
            type="button"
            className="ai-agent-btn ai-freebuff-btn"
            title="Send this prompt to FreeBuff (free coding agent) and run it"
            disabled={input.trim().length === 0 && !fileReady}
            onClick={() => {
              onAskFreebuff(input);
              setInput('');
            }}
          >
            <SparkleIcon size={13} /> Ask FreeBuff
          </button>
        )}
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

    </section>
  );
}
