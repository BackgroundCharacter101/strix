// Direct "bring your own provider" AI proxy. The renderer can't call external
// providers directly (webSecurity/CORS), so we stream an OpenAI-compatible chat
// completion here in the main process and forward tokens over IPC. Works with
// any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, Together, Mistral,
// DeepSeek, local Ollama/LM Studio, …) — no FreeLLMAPI involved.
//
// `streamFreeLLM` routes through the self-hosted FreeLLMAPI instance, keeping
// the unified API key inside the main process at all times.

export interface DirectChatParams {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: unknown }[];
  temperature?: number;
  maxTokens?: number;
  // 'anthropic' → the native Claude Messages API (not OpenAI-shaped). Anything
  // else (undefined) → an OpenAI-compatible endpoint (streamChat).
  provider?: string;
}

// Route a direct request to the right adapter (native Anthropic vs the
// OpenAI-compatible default). Used by the ai:directStart IPC handler.
export function streamDirect(
  params: DirectChatParams,
  onToken: (token: string) => void,
  isCancelled: () => boolean,
): Promise<{ ok: boolean; error?: string }> {
  return params.provider === 'anthropic'
    ? streamAnthropic(params, onToken, isCancelled)
    : streamChat(params, onToken, isCancelled);
}

// Native Anthropic Messages API (https://api.anthropic.com/v1/messages). Differs
// from OpenAI: x-api-key header, required max_tokens, a top-level `system` string
// (not a system message), and a content_block_delta SSE stream.
export async function streamAnthropic(
  params: DirectChatParams,
  onToken: (token: string) => void,
  isCancelled: () => boolean,
): Promise<{ ok: boolean; error?: string }> {
  const base = params.baseURL.trim().replace(/\/+$/, '') || 'https://api.anthropic.com';
  const url = `${base}/v1/messages`;

  // Split OpenAI-style messages into Anthropic's system string + user/assistant turns.
  const systemParts: string[] = [];
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of params.messages) {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    if (m.role === 'system') systemParts.push(text);
    else if (m.role === 'assistant') msgs.push({ role: 'assistant', content: text });
    else msgs.push({ role: 'user', content: text });
  }

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens && params.maxTokens > 0 ? params.maxTokens : 4096,
    messages: msgs,
    stream: true,
  };
  if (systemParts.length) body.system = systemParts.join('\n\n');
  if (typeof params.temperature === 'number') body.temperature = params.temperature;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: `Anthropic error (HTTP ${res.status}) ${t.slice(0, 300)}`.trim() };
  }
  if (!res.body) return { ok: false, error: 'Anthropic returned no response body.' };

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
            type?: string;
            delta?: { text?: string };
          };
          if (json.type === 'content_block_delta' && json.delta?.text) onToken(json.delta.text);
        } catch {
          /* event: lines / keep-alives — ignore */
        }
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}

// A locally-running model discovered on the machine, ready to add as a direct
// model (OpenAI-compatible base URL + the model id it serves).
export interface DetectedLocalModel {
  provider: string; // "Ollama" | "LM Studio"
  label: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

async function fetchJson(url: string, timeoutMs = 1500): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // not running / unreachable — silently skip
  } finally {
    clearTimeout(t);
  }
}

// Probe for local model servers (Ollama, LM Studio) and list what they serve, so
// the user can one-click add them as direct models — no URL/model typing.
export async function detectLocalModels(): Promise<DetectedLocalModel[]> {
  const out: DetectedLocalModel[] = [];

  // Ollama — native tags endpoint: { models: [{ name }] }.
  const ollama = (await fetchJson('http://127.0.0.1:11434/api/tags')) as
    | { models?: { name?: string }[] }
    | null;
  for (const m of ollama?.models ?? []) {
    if (typeof m.name !== 'string') continue;
    out.push({
      provider: 'Ollama',
      label: `Ollama · ${m.name}`,
      baseURL: 'http://127.0.0.1:11434/v1',
      apiKey: 'ollama',
      model: m.name,
    });
  }

  // LM Studio — OpenAI-compatible models list: { data: [{ id }] }.
  const lm = (await fetchJson('http://127.0.0.1:1234/v1/models')) as
    | { data?: { id?: string }[] }
    | null;
  for (const m of lm?.data ?? []) {
    if (typeof m.id !== 'string') continue;
    out.push({
      provider: 'LM Studio',
      label: `LM Studio · ${m.id}`,
      baseURL: 'http://127.0.0.1:1234/v1',
      apiKey: 'lm-studio',
      model: m.id,
    });
  }

  return out;
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

// --- FreeLLMAPI proxy: keeps the unified key inside main process -----------
// The renderer sends the FreeLLMAPI base URL + a chat payload; we fetch the
// key from the server here and stream the response back over IPC exactly like
// streamChat above. The API key never reaches renderer memory.

export interface FreeLLMChatParams {
  /** FreeLLMAPI base URL, e.g. http://192.168.1.50:3001 */
  serverUrl: string;
  model: string;
  messages: { role: string; content: unknown }[];
  temperature?: number;
  maxTokens?: number;
}

export async function streamFreeLLM(
  params: FreeLLMChatParams,
  onToken: (token: string) => void,
  isCancelled: () => boolean,
): Promise<{ ok: boolean; error?: string }> {
  const base = params.serverUrl.trim().replace(/\/+$/, '');
  // Fetch the unified key from the FreeLLMAPI settings endpoint (main process only).
  let apiKey = '';
  try {
    const keyRes = await fetch(`${base}/api/settings/api-key`);
    const keyBody = (await keyRes.json()) as { apiKey?: string };
    apiKey = keyBody.apiKey ?? '';
  } catch (e) {
    return { ok: false, error: `Could not reach AI server: ${e instanceof Error ? e.message : String(e)}` };
  }

  return streamChat(
    { baseURL: `${base}/v1`, apiKey, model: params.model, messages: params.messages, temperature: params.temperature, maxTokens: params.maxTokens },
    onToken,
    isCancelled,
  );
}
