import React, { useEffect, useRef, useState } from 'react';
import {
  runTask,
  complete,
  configureAi,
  parseScaffold,
  type TaskType,
  type ChatMessage,
  type SecurityStance,
  type ScaffoldPlan,
} from '@strix/ai-gateway';
import { CodeProposal } from './CodeProposal';
import { PromptDialog } from './PromptDialog';
import { SparkleIcon } from './icons';
import { renderMarkdown } from './markdown';
import { showToast } from './toast';
import { isSafeRelPath, looksLikeBuildRequest } from '@strix/ai-gateway';

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

// Text file extensions worth sending to the agent so it can MODIFY them.
const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|css|scss|less|html|htm|py|rb|php|go|rs|java|kt|c|h|cpp|hpp|cs|sh|bash|yml|yaml|toml|ini|env|sql|xml|svg|vue|svelte|astro|gitignore|dockerfile)$/i;

// Read the project's small text files (capped) so the agent can edit existing
// files instead of asking the user to open them. Returns fenced blocks.
async function gatherProjectFiles(
  workspaceKey: string,
  opts: { maxFiles?: number; maxBytes?: number; maxFileBytes?: number } = {},
): Promise<string> {
  const maxFiles = opts.maxFiles ?? 24;
  const maxBytes = opts.maxBytes ?? 60_000;
  const maxFileBytes = opts.maxFileBytes ?? 24_000;
  let tree: TreeNode;
  try {
    tree = (await window.strix.fs.tree(workspaceKey)) as TreeNode;
  } catch {
    return '';
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

  const parts: string[] = [];
  let total = 0;
  let count = 0;
  for (const abs of paths) {
    if (count >= maxFiles || total >= maxBytes) break;
    let content = '';
    try {
      content = await window.strix.fs.read(abs);
    } catch {
      continue;
    }
    if (content.length > maxFileBytes) continue;
    const rel = abs.slice(workspaceKey.length).replace(/^[\\/]/, '').replace(/\\/g, '/');
    parts.push(`File: ${rel}\n\`\`\`\n${content}\n\`\`\``);
    total += content.length;
    count += 1;
  }
  return parts.join('\n\n');
}

export function AiPanel({
  filePath,
  fileContent,
  onApplyEdit,
  onAskClaude,
  selectionRequest,
  aiServerUrl,
  mode = 'normal',
  securityStance = 'balanced',
  onSecurityStanceChange,
  securityPersonaText,
  workspaceKey,
  onConfigure,
  onOpenPath,
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
  // Hand the typed question (+ active file) off to a Claude Code terminal session.
  onAskClaude?: (text: string) => void;
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
    if (task === 'chat' && userMessage) {
      setHistory((h) => [...h, { role: 'user', content: userMessage }]);
      setInput('');
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    try {
      await runTask(
        task,
        { filePath: filePath ?? '', fileContent, userMessage, history: priorHistory, projectContext, securityMode, securityStance, securityPersonaText },
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
  const [scaffold, setScaffold] = useState<ScaffoldPlan | null>(null);
  const [applying, setApplying] = useState(false);

  // Ask the AI for a whole-project file plan from the prompt in the composer.
  const buildProject = async () => {
    const desc = input.trim();
    if (!desc || busy) return;
    if (!workspaceKey) {
      showToast('Open or create a project first, then ask me to build it.', 'info', 6000);
      return;
    }
    // Record the request in the thread (like a chat turn) and clear the box.
    const priorHistory = history;
    setHistory((h) => [...h, { role: 'user', content: desc }]);
    setInput('');
    setBusy(true);
    setStreaming('');
    const controller = new AbortController();
    abortRef.current = controller;
    let raw = '';
    try {
      // Give the agent the current file tree AND the contents of existing text
      // files, so it can MODIFY them live instead of asking you to open them.
      const existing = await gatherProjectFiles(workspaceKey);
      const ctx = existing
        ? `${projectContext}\n\nExisting files (modify as needed — return full updated content):\n${existing}`
        : projectContext;
      raw = await complete(
        'scaffold',
        { filePath: '', fileContent: '', userMessage: desc, history: priorHistory, projectContext: ctx, securityMode, securityStance, securityPersonaText },
        { model, signal: controller.signal },
      );
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
      showToast(`Could not read the build plan: ${plan.error}`, 'error', 7000);
      return;
    }
    setScaffold(plan);
  };

  // Write the approved plan to disk (paths are pre-validated as safe relatives).
  const applyScaffold = async () => {
    if (!scaffold || !workspaceKey) return;
    setApplying(true);
    try {
      for (const f of scaffold.files) {
        await window.strix.fs.write(`${workspaceKey}/${f.path}`, f.content);
      }
      showToast(`Created ${scaffold.files.length} file(s).`, 'success');
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content:
            `Built it — created ${scaffold.files.length} file(s):\n` +
            scaffold.files.map((f) => `- ${f.path}`).join('\n') +
            (scaffold.notes ? `\n\n${scaffold.notes}` : ''),
        },
      ]);
      // Reload/open the changed files (capped) so edits show live; reversed so
      // the first file ends up active.
      const toOpen = scaffold.files.slice(0, 6).map((f) => `${workspaceKey}/${f.path}`);
      toOpen.reverse().forEach((p) => onOpenPath?.(p));
      setInput('');
      setScaffold(null);
    } catch (e) {
      showToast(`Write failed: ${e instanceof Error ? e.message : String(e)}`, 'error', 7000);
    } finally {
      setApplying(false);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    setStreaming('');
    setRoutedVia(null);
  };

  // Decide whether a message is an instruction to create/modify files (apply
  // live) vs. a question/explanation (chat). Questions always stay chat.
  const wantsFileChanges = (text: string): boolean => {
    if (!workspaceKey) return false;
    const t = text.trim();
    if (
      /\?\s*$/.test(t) ||
      /^(how|what|why|where|when|which|who|can|could|do|does|did|is|are|should|would|will|explain|show|tell|describe|list)\b/i.test(
        t,
      )
    ) {
      return false;
    }
    if (looksLikeBuildRequest(t)) return true;
    const hadAssistant = history.some((m) => m.role === 'assistant');
    // Short confirmations after the assistant proposed changes ("do it", "add those").
    if (
      hadAssistant &&
      /^(do it|go ahead|yes|yep|yeah|sure|ok(ay)?|please do|add (those|that|them|it)|proceed|continue|build it|make it\b.*)/i.test(
        t,
      )
    ) {
      return true;
    }
    // Imperative edit verbs → modify the project's files.
    if (
      /\b(add|implement|update|modify|change|refactor|improve|enhance|integrate|extend|rewrite|remove|delete|rename)\b/i.test(
        t,
      )
    ) {
      return true;
    }
    return false;
  };

  // Send: build/modify the project's files when asked; otherwise normal chat.
  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    if (wantsFileChanges(text)) {
      void buildProject();
    } else {
      void run('chat');
    }
  };

  return (
    <section className="ai-pane-content" aria-label="AI chat">
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

      <div className="ai-composer">
        <textarea
          aria-label="Ask AI"
          placeholder="Ask, or say what to build…  (Enter to send, Shift+Enter for a new line)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="ai-actions">
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
              disabled={input.length === 0}
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
        {onAskClaude && (
          <button
            type="button"
            className="ai-claude-btn"
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

      {scaffold && (
        <div className="palette-overlay" onMouseDown={() => !applying && setScaffold(null)}>
          <div
            className="dialog scaffold-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm project build"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="dialog-title">Build project — {scaffold.files.length} file(s)</h2>
            {scaffold.notes && <p className="scaffold-notes">{scaffold.notes}</p>}
            <ul className="scaffold-list">
              {scaffold.files.map((f) => (
                <li key={f.path}>{f.path}</li>
              ))}
            </ul>
            <p className="scaffold-warn">
              Files are written into the current project (existing files with the same path are
              overwritten).
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="ai-ghost-btn"
                onClick={() => setScaffold(null)}
                disabled={applying}
              >
                Cancel
              </button>
              <button type="button" onClick={() => void applyScaffold()} disabled={applying}>
                {applying ? 'Creating…' : 'Create files'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
