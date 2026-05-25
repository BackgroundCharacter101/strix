import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'path';

let proc: ChildProcess | null = null;

export interface AiServerPaths {
  dir: string;
  entry: string;
}

// Resolve the vendored FreeLLMAPI server from the built main dir.
// Repo layout: <root>/apps/desktop/dist/main  →  <root>/freellmapi (4 levels up).
export function aiServerPaths(mainDir: string): AiServerPaths {
  const root = path.resolve(mainDir, '../../../..');
  const dir = path.join(root, 'freellmapi');
  const entry = path.join(dir, 'server', 'dist', 'index.js');
  return { dir, entry };
}

// Launch the FreeLLMAPI proxy as a child process so the AI "just works"
// without a separate terminal. No-op if already running, disabled, or not
// yet built.
export function startAiServer(mainDir: string, log: (msg: string) => void = console.log): void {
  if (proc) return;
  if (process.env.STRIX_NO_AI_SERVER) {
    log('[ai] auto-start disabled (STRIX_NO_AI_SERVER set)');
    return;
  }

  const { dir, entry } = aiServerPaths(mainDir);
  if (!existsSync(entry)) {
    log(`[ai] FreeLLMAPI not built (${entry}). Run "npm run ai:setup". Skipping auto-start.`);
    return;
  }

  proc = spawn('node', [entry], {
    cwd: dir,
    env: { ...process.env, PORT: process.env.FREELLMAPI_PORT ?? '3001' },
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
