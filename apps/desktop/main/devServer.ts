// Managed dev server for the Live Preview. Runs the project's dev command (e.g.
// `npm run dev`) as ONE child process per app, scans its output for the served
// localhost URL, and reports url/log/exit back to the renderer (which loads the
// URL in an embedded <webview>). Mirrors staticServer.ts's single-instance model.
//
// See docs/superpowers/specs/2026-07-11-live-web-preview-design.md.
import { spawn, type ChildProcess } from 'node:child_process';

export interface DevServerStatus {
  running: boolean;
  url: string | null;
  command: string | null;
  root: string | null;
}

export interface DevServerHandlers {
  onLog?: (chunk: string) => void;
  onUrl?: (url: string) => void;
  onExit?: (code: number | null) => void;
}

// Type of the spawn function — injectable so tests don't launch real processes.
export type SpawnFn = typeof spawn;

/**
 * First localhost/loopback URL a dev server prints (Vite "Local: http://…",
 * Next/CRA/Angular/etc.). 0.0.0.0 is normalized to localhost so the webview can
 * actually load it. Pure — unit-tested. (Mirrors renderer extractLocalUrl; the
 * main and renderer tsconfigs don't share modules, so the regex lives in both.)
 */
export function detectServerUrl(text: string): string | null {
  const m = /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/[^\s"'<>]*)?/i.exec(text);
  if (!m) return null;
  return m[0].replace('0.0.0.0', 'localhost');
}

let proc: ChildProcess | null = null;
let state: DevServerStatus = { running: false, url: null, command: null, root: null };
// Buffer the trailing partial line so we only match a URL once its line is
// complete — matching mid-chunk would catch "http://localhost" before its
// ":5173" arrives in the next chunk (the port is optional in the regex).
let lineBuf = '';

const idle = (): DevServerStatus => ({ running: false, url: null, command: null, root: null });

/**
 * Start (replacing any previous) the dev server. Returns the initial status
 * (running, url still null until detected). Handlers stream url/log/exit.
 */
export function startDevServer(
  root: string,
  command: string,
  handlers: DevServerHandlers = {},
  spawnImpl: SpawnFn = spawn,
): DevServerStatus {
  stopDevServer();
  lineBuf = '';
  const child = spawnImpl(command, { cwd: root, shell: true, windowsHide: true });
  proc = child;
  state = { running: true, url: null, command, root };

  let urlFound = false;
  const scan = (buf: Buffer | string) => {
    const chunk = buf.toString();
    handlers.onLog?.(chunk);
    if (urlFound) return;
    lineBuf += chunk;
    const lines = lineBuf.split(/\r?\n/);
    lineBuf = lines.pop() ?? ''; // keep the incomplete trailing line
    for (const line of lines) {
      const url = detectServerUrl(line);
      if (url) {
        urlFound = true;
        state.url = url;
        handlers.onUrl?.(url);
        return;
      }
    }
  };
  child.stdout?.on('data', scan);
  child.stderr?.on('data', scan);
  child.on('exit', (code) => {
    proc = null;
    state = idle();
    handlers.onExit?.(code ?? null);
  });
  child.on('error', (err) => {
    handlers.onLog?.(String(err.message ?? err));
  });
  return state;
}

/** Kill the dev server and its child tree. */
export function stopDevServer(): void {
  const pid = proc?.pid;
  if (pid) killTree(pid);
  proc = null;
  state = idle();
}

export function devServerStatus(): DevServerStatus {
  return state;
}

// Kill the whole process tree — a dev script spawns children (the actual server),
// so killing just the shell leaves the port bound. Windows: taskkill /T; POSIX:
// negative-pid group kill, falling back to a direct kill.
function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        process.kill(pid, 'SIGTERM');
      }
    }
  } catch {
    /* already gone */
  }
}
