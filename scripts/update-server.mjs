// Strix update feed — a tiny static server for the auto-updater.
//
// Serves everything under `dist-updates/` (the per-edition `latest-*.json`
// manifests + the installer `.exe`s written by scripts/update-publish.mjs).
// Phase 1 this runs on the dev PC; the client defaults to http://localhost:8787.
// Phase 2 = deploy the same `dist-updates/` folder behind https on a real host.
//
// Usage:  node scripts/update-server.mjs        (or `npm run update:serve`)
//   PORT / STRIX_UPDATE_PORT overrides the port (default 8787).
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(repo, 'dist-updates');
const PORT = Number(process.env.STRIX_UPDATE_PORT ?? process.env.PORT ?? 8787);

mkdirSync(ROOT, { recursive: true });

const TYPES = { '.json': 'application/json', '.exe': 'application/octet-stream' };

const server = http.createServer((req, res) => {
  // Decode + strip query, then resolve INSIDE ROOT (no path traversal).
  const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    console.log(`[update-server] 404 ${rel}`);
    return;
  }
  const size = statSync(file).size;
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-cache',
  });
  console.log(`[update-server] 200 ${rel} (${size} bytes)`);
  createReadStream(file).pipe(res);
});

// A friendly message instead of a raw stack when the port is already taken —
// almost always means an update server is already running (updates still work).
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(
      `[update-server] port ${PORT} is already in use — an update server is ` +
        `already running there, so updates already work. Nothing to do.`,
    );
    console.log(
      `[update-server] to run a fresh one, stop the other first ` +
        `(Windows: npx kill-port ${PORT}  —  or close its terminal).`,
    );
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`[update-server] serving ${ROOT}`);
  console.log(`[update-server] http://localhost:${PORT}/  (e.g. /latest-m1.json)`);
});
