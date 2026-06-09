import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import * as path from 'node:path';

// A tiny, dependency-free static file server used to host a workspace locally
// (Run & Serve → "Host this folder") and to back the in-IDE HTML preview. Binds
// 127.0.0.1 only (never exposed on the network) on an ephemeral port. A single
// server instance is shared, keyed by root, so the preview and the Run & Serve
// button reuse the same one.

export interface StaticServerInfo {
  url: string;
  port: number;
  root: string;
}

let server: http.Server | null = null;
let current: StaticServerInfo | null = null;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

// Resolve a request URL to an on-disk path under `root`, or null if it escapes
// root (path-traversal guard). Exported for unit testing.
export function resolveStaticPath(root: string, urlPath: string): string | null {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  const rel = clean.replace(/^\/+/, '');
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

export function contentTypeFor(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function handle(req: http.IncomingMessage, res: http.ServerResponse, root: string): void {
  const resolved = resolveStaticPath(root, req.url ?? '/');
  if (!resolved) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let target = resolved;
  let stat;
  try {
    stat = statSync(target);
  } catch {
    res.writeHead(404).end('Not found');
    return;
  }
  if (stat.isDirectory()) {
    target = path.join(target, 'index.html');
    try {
      statSync(target);
    } catch {
      res.writeHead(404).end('Not found');
      return;
    }
  }
  res.writeHead(200, {
    'Content-Type': contentTypeFor(target),
    'Cache-Control': 'no-store',
  });
  createReadStream(target).pipe(res);
}

export function staticServerInfo(): StaticServerInfo | null {
  return current;
}

// Start (or reuse) the static server for `root`. Idempotent per root; switching
// roots restarts it.
export function startStaticServer(root: string): Promise<StaticServerInfo> {
  const rootResolved = path.resolve(root);
  if (server && current && current.root === rootResolved) return Promise.resolve(current);
  stopStaticServer();
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => handle(req, res, rootResolved));
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server = srv;
      current = { url: `http://127.0.0.1:${port}`, port, root: rootResolved };
      resolve(current);
    });
  });
}

export function stopStaticServer(): void {
  if (server) {
    server.close();
    server = null;
    current = null;
  }
}
