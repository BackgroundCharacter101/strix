import OpenAI from 'openai';

// AI calls run directly from the Electron renderer (ARCHITECTURE §6.7), where
// `process` may be undefined and the OpenAI SDK requires an explicit browser
// opt-in.
const env: Record<string, string | undefined> =
  typeof process !== 'undefined' ? process.env : {};

const DEFAULT_BASE_URL = env.FREELLMAPI_URL ?? 'http://localhost:3001/v1';
const DEFAULT_API_KEY = env.FREELLMAPI_KEY ?? 'freellmapi-your-unified-key';

function makeClient(cfg: { baseURL?: string; apiKey?: string }): OpenAI {
  return new OpenAI({
    baseURL: cfg.baseURL || DEFAULT_BASE_URL,
    apiKey: cfg.apiKey || DEFAULT_API_KEY,
    dangerouslyAllowBrowser: true,
  });
}

// Live binding: reconfiguring swaps the instance that request.ts sees.
export let ai = makeClient({});

// Point the client at the running FreeLLMAPI instance (URL + unified key
// fetched from the bridge at runtime).
export function configureAi(cfg: { baseURL?: string; apiKey?: string }): void {
  ai = makeClient(cfg);
}
