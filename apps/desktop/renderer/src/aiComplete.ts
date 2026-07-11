// One-shot AI completion routed through the MAIN process (FreeLLMAPI proxy).
//
// Renderer-direct calls to the local FreeLLMAPI (localhost:3001) are CORS-blocked
// from the packaged app's file:// origin (the server only allows its own
// dashboard origins), so `complete()`/`runTask()` from @strix/ai-gateway silently
// fail in shipped builds. This helper uses the `ai.freellmStart` IPC — main does
// the fetch (Node, no CORS) and injects the unified key — and collects the
// streamed tokens into a single string. Same id-keyed contract as the AI panel.
let seq = 0;

export interface FreellmCompleteParams {
  /** FreeLLMAPI base URL; blank = the local server. */
  serverUrl: string;
  model: string;
  messages: { role: string; content: unknown }[];
  temperature?: number;
  maxTokens?: number;
}

export function freellmComplete(params: FreellmCompleteParams): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    let text = '';
    const offs: Array<() => void> = [];
    const finish = (fn: () => void) => {
      offs.forEach((f) => f());
      fn();
    };
    offs.push(
      window.strix.ai.onFreellmToken((p) => {
        if (p.id === id) text += p.token;
      }),
    );
    offs.push(
      window.strix.ai.onFreellmDone((p) => {
        if (p.id === id) finish(() => resolve(text));
      }),
    );
    offs.push(
      window.strix.ai.onFreellmError((p) => {
        if (p.id === id) finish(() => reject(new Error(p.error || 'AI request failed')));
      }),
    );
    window.strix.ai.freellmStart(id, params);
  });
}
