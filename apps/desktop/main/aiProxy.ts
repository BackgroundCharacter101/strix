// Direct "bring your own provider" AI proxy. The renderer can't call external
// providers directly (webSecurity/CORS), so we stream an OpenAI-compatible chat
// completion here in the main process and forward tokens over IPC. Works with
// any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, Together, Mistral,
// DeepSeek, local Ollama/LM Studio, …) — no FreeLLMAPI involved.

export interface DirectChatParams {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: unknown }[];
  temperature?: number;
  maxTokens?: number;
}

export async function streamChat(
  params: DirectChatParams,
  onToken: (token: string) => void,
  isCancelled: () => boolean,
): Promise<{ ok: boolean; error?: string }> {
  const base = params.baseURL.trim().replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    stream: true,
  };
  if (typeof params.temperature === 'number') body.temperature = params.temperature;
  if (params.maxTokens && params.maxTokens > 0) body.max_tokens = params.maxTokens;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: `Provider error (HTTP ${res.status}) ${t.slice(0, 300)}`.trim() };
  }
  if (!res.body) return { ok: false, error: 'Provider returned no response body.' };

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      if (isCancelled()) {
        await reader.cancel().catch(() => {});
        return { ok: true };
      }
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return { ok: true };
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const tok = json.choices?.[0]?.delta?.content;
          if (tok) onToken(tok);
        } catch {
          /* keep-alive / partial line — ignore */
        }
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}
