import React, { useEffect, useState } from 'react';
import { runTask, configureAi, type TaskType, type ChatMessage } from '@strix/ai-gateway';

const HISTORY_KEY = 'strix.ai.history';

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function AiPanel({
  filePath,
  fileContent,
}: {
  filePath: string | null;
  fileContent: string;
}) {
  const [input, setInput] = useState('');
  const [model, setModel] = useState('auto');
  const [models, setModels] = useState<string[]>(['auto']);
  const [history, setHistory] = useState<ChatMessage[]>(loadHistory);
  const [streaming, setStreaming] = useState('');
  const [routedVia, setRoutedVia] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Point the AI client at the running FreeLLMAPI and load its model list.
  useEffect(() => {
    window.strix.ai.config().then(configureAi);
    window.strix.ai.models().then(setModels);
  }, []);

  // Persist the conversation so it survives restarts and any model switch.
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* ignore quota/availability errors */
    }
  }, [history]);

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
        { filePath: filePath ?? '', fileContent, userMessage, history: priorHistory },
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

  const clearHistory = () => {
    setHistory([]);
    setStreaming('');
    setRoutedVia(null);
  };

  return (
    <section className="ai-pane-content" aria-label="AI chat">
      <div className="ai-toolbar">
        <select aria-label="model" value={model} onChange={(e) => setModel(e.target.value)}>
          {models.map((m) => (
            <option key={m} value={m}>
              {m === 'auto' ? 'Auto (router)' : m}
            </option>
          ))}
        </select>
        <button type="button" onClick={clearHistory} disabled={busy || history.length === 0}>
          Clear
        </button>
      </div>

      <div className="ai-thread" aria-label="AI conversation">
        {history.map((m, i) => (
          <div key={i} className={`ai-msg ai-${m.role}`}>
            {m.content}
          </div>
        ))}
        {streaming && <div className="ai-msg ai-assistant">{streaming}</div>}
      </div>

      <textarea
        aria-label="Ask AI"
        placeholder="Ask about this file…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="ai-actions">
        <button type="button" onClick={() => run('chat')} disabled={busy || input.length === 0}>
          Send
        </button>
        <button type="button" onClick={() => run('explain')} disabled={busy || !fileReady}>
          Explain
        </button>
        <button type="button" onClick={() => run('vuln_check')} disabled={busy || !fileReady}>
          Check security
        </button>
      </div>
      {routedVia && <footer className="ai-routed">Routed via: {routedVia}</footer>}
    </section>
  );
}
