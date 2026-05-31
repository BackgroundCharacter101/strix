import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'path';

let proc: ChildProcess | null = null;

export interface AiServerPaths {
  dir: string;
  entry: string;
}

export interface AiServerOptions {
  // Executable used to run the server (default 'node'). When packaged this is
  // the Electron binary (process.execPath) run as plain Node — see runAsNode.
  nodeExec?: string;
  // Directory that CONTAINS the `freellmapi` folder. Dev resolves this from the
  // built main dir; packaged builds pass process.resourcesPath (extraResources).
  baseDir?: string;
  // Set ELECTRON_RUN_AS_NODE=1 so the Electron binary runs as Node (packaged
  // apps have no guaranteed system `node`).
  runAsNode?: boolean;
}

// Resolve the vendored FreeLLMAPI server. Dev layout:
// <root>/apps/desktop/dist/main → <root>/freellmapi (4 levels up).
// Packaged: baseDir = process.resourcesPath → <resources>/freellmapi.
export function aiServerPaths(mainDir: string, baseDir?: string): AiServerPaths {
  const root = baseDir ?? path.resolve(mainDir, '../../../..');
  const dir = path.join(root, 'freellmapi');
  const entry = path.join(dir, 'server', 'dist', 'index.js');
  return { dir, entry };
}

// Launch the FreeLLMAPI proxy as a child process so the AI "just works"
// without a separate terminal. No-op if already running, disabled, or not
// yet built.
export function startAiServer(
  mainDir: string,
  opts: AiServerOptions = {},
  log: (msg: string) => void = console.log,
): void {
  if (proc) return;
  if (process.env.STRIX_NO_AI_SERVER) {
    log('[ai] auto-start disabled (STRIX_NO_AI_SERVER set)');
    return;
  }

  const { dir, entry } = aiServerPaths(mainDir, opts.baseDir);
  if (!existsSync(entry)) {
    log(`[ai] FreeLLMAPI not built (${entry}). Run "npm run ai:setup". Skipping auto-start.`);
    return;
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: process.env.FREELLMAPI_PORT ?? '3001',
  };
  if (opts.runAsNode) env.ELECTRON_RUN_AS_NODE = '1';

  proc = spawn(opts.nodeExec ?? 'node', [entry], {
    cwd: dir,
    env,
    stdio: 'pipe',
  });
  proc.stdout?.on('data', (d) => log(`[ai] ${String(d).trimEnd()}`));
  proc.stderr?.on('data', (d) => log(`[ai:err] ${String(d).trimEnd()}`));
  proc.on('exit', (code) => {
    log(`[ai] FreeLLMAPI exited (code ${code ?? 'null'})`);
    proc = null;
  });
  log('[ai] FreeLLMAPI starting on :' + (process.env.FREELLMAPI_PORT ?? '3001'));
}

export function stopAiServer(): void {
  if (proc) {
    proc.kill();
    proc = null;
  }
}
