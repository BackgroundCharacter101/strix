// Strix live-reload dev loop — edit source, see it update, no installer rebuild.
//
// What it runs, all from this one process:
//   1. FreeLLMAPI (:3001) — started ONCE here and kept alive across Electron
//      restarts. Electron is told to skip its own auto-start (STRIX_NO_AI_SERVER)
//      so a main-process restart never double-binds :3001 or orphans the server.
//   2. Vite dev server (:3000) — the renderer. Edits to React/CSS hot-reload in
//      place (HMR), no restart, no rebuild.
//   3. Electron main + preload — bundled with esbuild in WATCH mode. On any
//      main/*.ts save, esbuild rebuilds and we relaunch just the Electron window
//      (renderer state re-loads from the still-running Vite server).
//
// Usage:  node scripts/dev.mjs [m1|competition]
//   (wired as `npm run dev:app` / `dev:app:competition`)
//
// Ctrl+C, or closing the Strix window, tears all three down cleanly.
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(repo, 'apps', 'desktop');
const rendererDir = path.join(desktop, 'renderer');

const edition = process.argv[2] === 'competition' ? 'competition' : 'm1';
const VITE_PORT = Number(process.env.STRIX_DEV_PORT ?? 3000);
const DEV_URL = `http://localhost:${VITE_PORT}`;
const AI_PORT = Number(process.env.FREELLMAPI_PORT ?? 3001);

const log = (m) => console.log(`\x1b[35m[dev]\x1b[0m ${m}`);

// Children we own — killed on shutdown.
/** @type {import('node:child_process').ChildProcess[]} */
const owned = [];
let electronProc = null;
let esbuildCtx = null;
let shuttingDown = false;

// ── FreeLLMAPI (persistent) ────────────────────────────────────────────────
function startAiServer() {
  const bundle = path.join(repo, 'freellmapi', '.bundle', 'index.mjs');
  const serverDist = path.join(repo, 'freellmapi', 'server', 'dist', 'index.js');
  const entry = existsSync(bundle) ? bundle : serverDist;
  if (!existsSync(entry)) {
    log(`FreeLLMAPI not built (${entry}). Run "npm run ai:setup". AI answers disabled.`);
    return;
  }
  const dataDir = path.join(repo, '.dev-data');
  mkdirSync(dataDir, { recursive: true });
  const proc = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      PORT: String(AI_PORT),
      FREELLMAPI_DB_PATH: path.join(dataDir, 'freeapi.db'),
    },
    stdio: 'pipe',
  });
  proc.stdout?.on('data', (d) => process.stdout.write(`\x1b[36m[ai]\x1b[0m ${d}`));
  proc.stderr?.on('data', (d) => process.stderr.write(`\x1b[36m[ai:err]\x1b[0m ${d}`));
  owned.push(proc);
  log(`FreeLLMAPI starting on :${AI_PORT}`);
}

// ── Vite dev server (renderer HMR) ─────────────────────────────────────────
function startVite() {
  const viteBin = path.join(repo, 'node_modules', 'vite', 'bin', 'vite.js');
  const proc = spawn(process.execPath, [viteBin, '--port', String(VITE_PORT), '--strictPort'], {
    cwd: rendererDir,
    env: { ...process.env, STRIX_EDITION: edition },
    stdio: 'pipe',
  });
  proc.stdout?.on('data', (d) => process.stdout.write(`\x1b[32m[vite]\x1b[0m ${d}`));
  proc.stderr?.on('data', (d) => process.stderr.write(`\x1b[32m[vite]\x1b[0m ${d}`));
  owned.push(proc);
  log(`Vite starting on :${VITE_PORT}`);
}

// Poll the Vite dev server over HTTP until it answers, so Electron never loads
// too early. HTTP (not a raw socket) so Node's happy-eyeballs picks the right
// address family — Vite binds `localhost`, which is IPv6 (::1) first on Windows.
function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(); });
      req.setTimeout(1500, () => req.destroy(new Error('timeout')));
      req.once('error', () => {
        if (Date.now() > deadline) reject(new Error(`${url} not up in ${timeoutMs}ms`));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

// ── Electron (relaunched on every main rebuild) ────────────────────────────
function launchElectron() {
  // Replace the running window, if any. Mark it so its exit handler knows the
  // restart was intentional (a user-closed window, by contrast, ends the loop).
  if (electronProc) {
    electronProc.expectExit = true;
    electronProc.kill();
  }
  const electronBin = require('electron'); // resolves to the electron executable path
  const proc = spawn(electronBin, ['.'], {
    cwd: desktop,
    env: {
      ...process.env,
      STRIX_DEV_URL: DEV_URL,
      STRIX_EDITION: edition,
      STRIX_NO_AI_SERVER: '1', // we run FreeLLMAPI ourselves, once
    },
    stdio: 'inherit',
  });
  electronProc = proc;
  proc.on('exit', (code) => {
    if (proc.expectExit) return; // we killed it to restart — ignore
    log('Strix window closed — shutting down dev loop.');
    shutdown(code ?? 0);
  });
}

// ── esbuild watch (main + preload → dist/main/*.cjs) ───────────────────────
async function startMainWatch() {
  const restartOnBuild = {
    name: 'strix-restart-electron',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length) {
          log(`main build FAILED (${result.errors.length} error(s)) — window left as-is.`);
          return;
        }
        log(electronProc ? 'main rebuilt → relaunching Strix' : 'main built → launching Strix');
        launchElectron();
      });
    },
  };
  esbuildCtx = await esbuild.context({
    absWorkingDir: desktop,
    entryPoints: ['main/index.ts', 'main/preload.mts'],
    outdir: 'dist/main',
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron', 'node-pty'],
    define: {
      __STRIX_EDITION__: JSON.stringify(edition),
      'import.meta.url': '__strixImportMetaUrl',
    },
    banner: {
      js: 'const __strixImportMetaUrl = require("url").pathToFileURL(__filename).href;',
    },
    logLevel: 'silent',
    plugins: [restartOnBuild],
  });
  await esbuildCtx.watch();
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('stopping…');
  if (electronProc) { electronProc.expectExit = true; electronProc.kill(); }
  for (const p of owned) { try { p.kill(); } catch { /* already gone */ } }
  try { await esbuildCtx?.dispose(); } catch { /* ignore */ }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  log(`edition=${edition} · renderer=${DEV_URL} · ai=:${AI_PORT}`);
  startAiServer();
  startVite();
  await waitForServer(DEV_URL).catch((e) => { log(String(e)); shutdown(1); });
  await startMainWatch(); // first build launches Electron via onEnd
  log('watching main/*.ts — save to reload · edit renderer for instant HMR · Ctrl+C to stop');
}

main().catch((e) => { console.error(e); shutdown(1); });
