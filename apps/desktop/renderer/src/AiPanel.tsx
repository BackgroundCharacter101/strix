import React, { useEffect, useRef, useState } from 'react';
import {
  runTask,
  complete,
  configureAi,
  type TaskType,
  type ChatMessage,
  type SecurityStance,
} from '@strix/ai-gateway';
import { CodeProposal } from './CodeProposal';
import { SparkleIcon } from './icons';
import { renderMarkdown } from './markdown';

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
}: {
  filePath: string | null;
  fileContent: string;
  onApplyEdit?: (content: string) => void;
  // Workspace root — AI chat history is saved/loaded per project.
  workspaceKey?: string | null;
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

  // Reload the conversation when the workspace changes (per-project chat).
  useEffect(() => {
    const key = historyKeyFor(workspaceKey);
    histKeyRef.current = key;
    setHistory(loadHistory(key));
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

    let acc = '';
    try {
      await runTask(
        task,
        { filePath: filePath ?? '', fileContent, userMessage, history: priorHistory, securityMode, securityStance, securityPersonaText },
        {
          onToken: (token) => {
            acc += token;
            setStreaming(acc);
          },
          onDone: (via) => setRoutedVia(via),
        },
        { model },
      );
    } finally {
      setBusy(false);
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
        { model },
      );
    } finally {
      setBusy(false);
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
        { model },
      );
      if (suggested.trim()) setProposal({ original: fileContent, suggested });
    } finally {
      setBusy(false);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    setStreaming('');
    setRoutedVia(null);
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
                <div key={i} className={`ai-msg ai-${m.role}`}>
                  {m.role === 'assistant' ? (
                    <div className="ai-md">{renderMarkdown(m.content)}</div>
                  ) : (
                    m.content
                  )}
                </div>
              ))}
              {streaming && (
                <div className="ai-msg ai-assistant">
                  <div className="ai-md">{renderMarkdown(streaming)}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {routedVia && <div className="ai-routed">Routed via: {routedVia}</div>}

      <div className="ai-composer">
        <textarea
          aria-label="Ask AI"
          placeholder="Ask about this file…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="ai-actions">
          <button
            type="button"
            className="ai-primary-btn"
            onClick={() => run('chat')}
            disabled={busy || input.length === 0}
          >
            {busy ? 'Working…' : 'Send'}
          </button>
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
    </section>
  );
}
