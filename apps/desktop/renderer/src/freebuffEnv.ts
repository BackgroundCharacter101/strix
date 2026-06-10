// Build the environment variables injected into the FreeBuff terminal session
// so users can point the local `freebuff` CLI at their own VPS / full-access
// backend (instead of the rate-limited default). FreeBuff runs locally (it edits
// local files); only its backend/LLM traffic goes remote — so we configure that
// via env vars rather than tunnelling the whole agent.
//
// Exact var names aren't all documented, so we set the most likely ones AND let
// the freeform "extra env" box override anything (applied last).

export interface FreebuffConnection {
  apiKey?: string;
  proxyUrl?: string;
  backendUrl?: string;
  extraEnv?: string;
}

// Parse a KEY=VALUE-per-line block (blank lines and `#` comments ignored).
export function parseEnvLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

export function buildFreebuffEnv(c: FreebuffConnection): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey = c.apiKey?.trim();
  if (apiKey) {
    // Cover both the FreeBuff and upstream Codebuff naming.
    env.CODEBUFF_API_KEY = apiKey;
    env.FREEBUFF_API_KEY = apiKey;
  }
  const proxy = c.proxyUrl?.trim();
  if (proxy) {
    // Standard proxy vars (upper + lower case — tools read either) route the
    // CLI's traffic through the user's VPS/VPN.
    env.HTTPS_PROXY = proxy;
    env.HTTP_PROXY = proxy;
    env.https_proxy = proxy;
    env.http_proxy = proxy;
  }
  const backend = c.backendUrl?.trim();
  if (backend) {
    env.CODEBUFF_BACKEND_URL = backend;
    env.CODEBUFF_API_URL = backend;
    env.CODEBUFF_BASE_URL = backend;
  }
  // Freeform overrides win (exact, user-specified names).
  Object.assign(env, parseEnvLines(c.extraEnv ?? ''));
  return env;
}

// Whether any connection setting is configured (so the UI/launcher can skip
// injecting an empty env).
export function hasFreebuffConnection(c: FreebuffConnection): boolean {
  return Object.keys(buildFreebuffEnv(c)).length > 0;
}
