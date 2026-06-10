import { createRequire } from 'module';
import { exec } from 'node:child_process';
import type { IPty } from 'node-pty';

const nodeRequire = createRequire(import.meta.url);

export interface ExecResult {
  exitCode: number;
  output: string;
}

// Run a one-off shell command, capturing combined stdout+stderr and the exit
// code, so the AI agent can see whether a command succeeded or failed and why.
// Capped + timed out so a hung/long process can't block forever.
export function execCommand(
  command: string,
  cwd?: string,
  timeoutMs = 120_000,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const output = `${stdout ?? ''}${stderr ?? ''}`.slice(-8000);
        const code = err as (Error & { code?: number; killed?: boolean }) | null;
        const exitCode = code ? (typeof code.code === 'number' ? code.code : code.killed ? 124 : 1) : 0;
        resolve({ exitCode, output: output || (err ? String(err) : '') });
      },
    );
  });
}

export interface TerminalCreateOptions {
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  // Extra environment variables merged over process.env for this session (used
  // to point the FreeBuff CLI at a user's own VPS / full-access backend).
  env?: Record<string, string>;
}

// Minimal surface the manager needs from a PTY — lets tests inject a fake.
export interface PtyProcess {
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export type SpawnFn = (
  shell: string,
  opts: { cwd: string; cols: number; rows: number; env?: Record<string, string> },
) => PtyProcess;

export function defaultShell(): string {
  if (process.platform === 'win32') {
    // Prefer PowerShell over the legacy cmd.exe for a modern terminal.
    // STRIX_SHELL lets the user override (e.g. their COMSPEC, pwsh, or bash).
    return process.env.STRIX_SHELL ?? 'powershell.exe';
  }
  return process.env.SHELL ?? 'bash';
}

// node-pty is a native module; require it lazily so importing this file
// (e.g. in tests with an injected spawn) never loads the binary.
const defaultSpawn: SpawnFn = (shell, opts) => {
  const pty = nodeRequire('node-pty') as typeof import('node-pty');
  const proc: IPty = pty.spawn(shell, [], {
    name: 'xterm-color',
    cwd: opts.cwd,
    cols: opts.cols,
    rows: opts.rows,
    // Caller env merged over the inherited environment.
    env: { ...(process.env as Record<string, string>), ...(opts.env ?? {}) },
    // Use the modern ConPTY backend on Windows (better ANSI/Unicode + speed
    // than the legacy winpty). Ignored on other platforms.
    ...(process.platform === 'win32' ? { useConpty: true } : {}),
  });
  return {
    onData: (cb) => proc.onData(cb),
    onExit: (cb) => proc.onExit(({ exitCode }) => cb({ exitCode })),
    write: (data) => proc.write(data),
    resize: (cols, rows) => proc.resize(cols, rows),
    kill: () => proc.kill(),
  };
};

export class TerminalManager {
  private readonly sessions = new Map<string, PtyProcess>();
  private seq = 0;

  constructor(private readonly spawn: SpawnFn = defaultSpawn) {}

  create(
    opts: TerminalCreateOptions = {},
    onData?: (id: string, data: string) => void,
    onExit?: (id: string, exitCode: number) => void,
  ): string {
    const id = `term-${++this.seq}`;
    const proc = this.spawn(opts.shell ?? defaultShell(), {
      cwd: opts.cwd ?? process.cwd(),
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      env: opts.env,
    });

    proc.onData((data) => onData?.(id, data));
    proc.onExit(({ exitCode }) => {
      this.sessions.delete(id);
      onExit?.(id, exitCode);
    });

    this.sessions.set(id, proc);
    return id;
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.resize(cols, rows);
  }

  kill(id: string): void {
    const proc = this.sessions.get(id);
    if (proc) {
      proc.kill();
      this.sessions.delete(id);
    }
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  get count(): number {
    return this.sessions.size;
  }
}
