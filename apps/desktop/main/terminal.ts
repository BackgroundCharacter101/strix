import { createRequire } from 'module';
import type { IPty } from 'node-pty';

const nodeRequire = createRequire(import.meta.url);

export interface TerminalCreateOptions {
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
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
  opts: { cwd: string; cols: number; rows: number },
) => PtyProcess;

export function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC ?? 'powershell.exe';
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
    env: process.env as Record<string, string>,
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
