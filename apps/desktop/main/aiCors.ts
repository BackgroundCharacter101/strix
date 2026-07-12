// Let the packaged renderer (a file:// origin) call the LOCAL FreeLLMAPI server
// directly. The server only sets CORS headers for its own dashboard origins, so
// without this every renderer-direct AI call (autocomplete, Ctrl+G generate, the
// selection toolbar, coding agents, and FreeLLMAPI chat) is CORS-blocked in a
// shipped build — only the main-process paths (direct models) work. We inject a
// permissive Access-Control-Allow-* on the local server's responses in main, the
// standard Electron way, which fixes the whole cluster at once.
//
// Scoped to localhost/127.0.0.1 + the FreeLLMAPI paths (/v1/*, /api/*) so it
// never relaxes CORS for anything else (the update feed, previewed sites, etc.).

/** True for a request to the LOCAL FreeLLMAPI server (/v1/* or /api/* on loopback). */
export function isLocalAiEndpoint(url: string): boolean {
  try {
    const u = new URL(url);
    const loopback =
      u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
    return loopback && /^\/(v1|api)\//.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Return response headers with permissive CORS added when `url` is the local AI
 * server, else `null` to leave the response untouched. Header values are string
 * arrays to match Electron's `onHeadersReceived` shape.
 */
export function withAiCors(
  url: string,
  headers: Record<string, string[]>,
): Record<string, string[]> | null {
  if (!isLocalAiEndpoint(url)) return null;
  return {
    ...headers,
    'Access-Control-Allow-Origin': ['*'],
    'Access-Control-Allow-Headers': ['*'],
    'Access-Control-Allow-Methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  };
}
