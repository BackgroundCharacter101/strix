// Self-hosted update feed.
//
// The auto-updater fetches its manifest + installer over HTTP, which normally
// means keeping `npm run update:serve` running in a terminal. When this build is
// configured with a feed folder, Strix serves that folder itself on startup, so
// "Check for Updates" works whenever the app is open — no second process.
//
// Deliberately restricted, because it is an HTTP server inside a desktop app:
//   * OFF unless a feed folder is configured AND exists (public builds ship with
//     __STRIX_UPDATE_SERVE_DIR__ empty — see esbuild.main.mjs).
//   * bound to 127.0.0.1 only, never 0.0.0.0 — not reachable from the network.
//   * serves ONLY .json manifests and .exe installers, resolved inside the root.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Baked by esbuild (--define). Empty string = feature off.
declare const __STRIX_UPDATE_SERVE_DIR__: string;
const BAKED_DIR: string =
  typeof __STRIX_UPDATE_SERVE_DIR__ === 'undefined' ? '' : __STRIX_UPDATE_SERVE_DIR__;

export const UPDATE_FEED_PORT = Number(process.env.STRIX_UPDATE_PORT ?? 8787);

// Runtime env wins over the baked path, so a build can be pointed elsewhere.
export function resolveFeedDir(
  env: NodeJS.ProcessEnv = process.env,
  baked: string = BAKED_DIR,
): string | null {
  const dir = env.STRIX_UPDATE_SERVE_DIR || baked;
  return dir && dir.trim() ? path.resolve(dir.trim()) : null;
}

// Only the two file kinds a feed is made of. Anything else is 404 even if the
// path resolves — this server must never become a general file server.
const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.exe': 'application/octet-stream',
};

// Resolve a request path inside `root`, or null if it escapes or isn't servable.
export function resolveFeedFile(root: string, urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null; // malformed percent-encoding
  }
  rel = rel.replace(/^\/+/, '');
  if (!rel) return null;
  const file = path.resolve(root, rel);
  // path.resolve collapses `..`; confirm the result is still under root.
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!file.startsWith(rootWithSep)) return null;
  if (!(path.extname(file).toLowerCase() in TYPES)) return null;
  return file;
}

let server: http.Server | null = null;

export interface UpdateFeedInfo {
  url: string;
  dir: string;
}

// Start serving the feed. Resolves null when the feature is off (no folder
// configured / folder missing) or the port is already taken by a feed server
// that is already doing the job.
export function startUpdateFeed(
  log: (msg: string) => void = () => {},
): Promise<UpdateFeedInfo | null> {
  const dir = resolveFeedDir();
  if (!dir) return Promise.resolve(null);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    log(`[update-feed] configured folder does not exist, not serving: ${dir}`);
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const file = resolveFeedFile(dir, req.url ?? '/');
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()],
        'content-length': fs.statSync(file).size,
        'cache-control': 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });

    srv.on('error', (err: NodeJS.ErrnoException) => {
      // Someone already serves this port (a `npm run update:serve` terminal, or
      // a second Strix window). Updates still work, so this is not an error.
      if (err.code === 'EADDRINUSE') {
        log(`[update-feed] port ${UPDATE_FEED_PORT} already in use — using that server`);
      } else {
        log(`[update-feed] could not start: ${err.message}`);
      }
      server = null;
      resolve(null);
    });

    // Loopback only.
    srv.listen(UPDATE_FEED_PORT, '127.0.0.1', () => {
      server = srv;
      const url = `http://localhost:${UPDATE_FEED_PORT}`;
      log(`[update-feed] serving ${dir} at ${url}`);
      resolve({ url, dir });
    });
  });
}

export function stopUpdateFeed(): void {
  server?.close();
  server = null;
}
