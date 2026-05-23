import OpenAI from 'openai';

// AI calls run directly from the Electron renderer (ARCHITECTURE §6.7), where
// `process` may be absent and the OpenAI SDK requires an explicit browser opt-in.
const env: Record<string, string | undefined> =
  typeof process !== 'undefined' ? process.env : {};

export const ai = new OpenAI({
  baseURL: env.FREELLMAPI_URL ?? 'http://localhost:3001/v1',
  apiKey: env.FREELLMAPI_KEY ?? 'freellmapi-your-unified-key',
  dangerouslyAllowBrowser: true,
});
