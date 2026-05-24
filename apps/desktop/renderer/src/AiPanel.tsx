import React, { useState } from 'react';
import { runTask, type TaskType } from '@strix/ai-gateway';

export function AiPanel({
  filePath,
  fileContent,
}: {
  filePath: string | null;
  fileContent: string;
}) {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [routedVia, setRoutedVia] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // File-context actions act on the live editor buffer for the selected file.
  const fileReady = filePath !== null;

  const run = async (task: TaskType) => {
    setBusy(true);
    setResponse('');
    setRoutedVia(null);
    try {
      await runTask(
        task,
        { filePath: filePath ?? '', fileContent, userMessage: input },
        {
          onToken: (token) => setResponse((prev) => prev + token),
          onDone: (via) => setRoutedVia(via),
        },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="AI chat">
      <textarea aria-label="Ask AI" value={input} onChange={(e) => setInput(e.target.value)} />
      <button type="button" onClick={() => run('chat')} disabled={busy || input.length === 0}>
        Send
      </button>
      <button type="button" onClick={() => run('explain')} disabled={busy || !fileReady}>
        Explain
      </button>
      <button type="button" onClick={() => run('vuln_check')} disabled={busy || !fileReady}>
        Check security
      </button>
      <div aria-label="AI response">{response}</div>
      {routedVia && <footer>Routed via: {routedVia}</footer>}
    </section>
  );
}
