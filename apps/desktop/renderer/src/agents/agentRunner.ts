import { streamChatRaw, configureAi, type RawMessage } from '@strix/ai-gateway';
import type { DirectModel } from '../useSettings';

export interface RunModelOpts {
  persona: string;
  context: string;
  // 'auto', a FreeLLMAPI model id, or 'direct:<id>'.
  model: string;
  aiDirectModels: DirectModel[];
  aiServerUrl?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken?: (t: string) => void;
}

let directSeq = 0;

// Run one agent turn and resolve with the full text. Routes to the user's direct
// provider (through the main process) when a direct model is selected, otherwise
// to FreeLLMAPI (booting + configuring the local client first).
export async function runAgentModel(opts: RunModelOpts): Promise<string> {
  const messages: RawMessage[] = [
    { role: 'system', content: opts.persona },
    { role: 'user', content: opts.context },
  ];

  const direct = opts.model.startsWith('direct:')
    ? opts.aiDirectModels.find((d) => `direct:${d.id}` === opts.model)
    : undefined;

  if (direct) return streamDirect(direct, messages, opts);

  // FreeLLMAPI: make sure the local server is up and the client points at it.
  await window.strix.ai.ensure(opts.aiServerUrl || undefined);
  const cfg = await window.strix.ai.config(opts.aiServerUrl || undefined);
  configureAi(cfg);
  return streamChatRaw(
    messages,
    {
      model: opts.model || 'auto',
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
    },
    opts.onToken,
  );
}

function streamDirect(
  direct: DirectModel,
  messages: RawMessage[],
  opts: RunModelOpts,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const id = ++directSeq;
    let text = '';
    let settled = false;
    const offs: Array<() => void> = [];
    const signal = opts.signal;
    const cleanup = () => {
      offs.forEach((f) => f());
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      window.strix.ai.directCancel(id);
      if (!settled) {
        settled = true;
        cleanup();
        resolve(text);
      }
    };
    offs.push(
      window.strix.ai.onDirectToken((p) => {
        if (p.id === id) {
          text += p.token;
          opts.onToken?.(p.token);
        }
      }),
    );
    offs.push(
      window.strix.ai.onDirectDone((p) => {
        if (p.id === id && !settled) {
          settled = true;
          cleanup();
          resolve(text);
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
    window.strix.ai.directStart(id, {
      baseURL: direct.baseURL,
      apiKey: direct.apiKey,
      model: direct.model,
      messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      provider: direct.provider,
    });
  });
}
