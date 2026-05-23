import React, { useState } from 'react';
import { runTask } from '@tabea/ai-gateway';
import { useFileContents } from './useFileContents';

export function AiPanel({ filePath }: { filePath: string | null }) {
  const { content } = useFileContents(filePath);
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [routedVia, setRoutedVia] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setResponse('');
    setRoutedVia(null);
    try {
      await runTask(
        'chat',
        { filePath: filePath ?? '', fileContent: content ?? '', userMessage: input },
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
      <button type="button" onClick={send} disabled={busy || input.length === 0}>
        Send
      </button>
      <div aria-label="AI response">{response}</div>
      {routedVia && <footer>Routed via: {routedVia}</footer>}
    </section>
  );
}
