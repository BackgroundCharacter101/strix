import { spawn as nodeSpawn } from 'node:child_process';

export type Language =
  | 'python'
  | 'typescript'
  | 'javascript'
  | 'c'
  | 'cpp'
  | 'bash'
  | 'rust'
  | 'go';

export type JsonRpcMessage = Record<string, unknown>;

interface ServerSpec {
  command: string;
  args: string[];
}

// Language → language-server launch command (ARCHITECTURE §6.5).
const SERVERS: Record<Language, ServerSpec> = {
  python: { command: 'pylsp', args: [] },
  typescript: { command: 'typescript-language-server', args: ['--stdio'] },
  javascript: { command: 'typescript-language-server', args: ['--stdio'] },
  c: { command: 'clangd', args: [] },
  cpp: { command: 'clangd', args: [] },
  bash: { command: 'bash-language-server', args: ['start'] },
  rust: { command: 'rust-analyzer', args: [] },
  go: { command: 'gopls', args: [] },
};

// Minimal surface the manager needs from a child process — lets tests inject
// a fake instead of spawning a real language server.
export interface LspProcess {
  stdin: { write(data: string): void };
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): void };
  on(event: 'exit', cb: (code: number | null) => void): void;
  kill(): void;
}

export type SpawnLsp = (command: string, args: string[], opts: { cwd: string }) => LspProcess;

const defaultSpawn: SpawnLsp = (command, args, opts) => {
  // On Windows the servers are .cmd/.exe shims (typescript-language-server,
  // pylsp); spawn needs a shell to resolve them via PATHEXT.
  const child = nodeSpawn(command, args, {
    cwd: opts.cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  return {
    stdin: { write: (data) => void child.stdin.write(data) },
    stdout: { on: (event, cb) => void child.stdout.on(event, cb) },
    on: (event, cb) => void child.on(event, cb),
    kill: () => void child.kill(),
  };
};

interface Session {
  proc: LspProcess;
  buffer: Buffer;
}

// Frame a JSON-RPC message with the LSP `Content-Length` header.
function frame(message: JsonRpcMessage): string {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
}

// Pull every complete `Content-Length`-framed message out of the buffer,
// leaving any trailing partial frame in place for the next chunk.
function drain(session: Session): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = [];
  for (;;) {
    const sep = session.buffer.indexOf('\r\n\r\n');
    if (sep === -1) break;

    const header = session.buffer.subarray(0, sep).toString('ascii');
    const bodyStart = sep + 4;
    const match = /content-length:\s*(\d+)/i.exec(header);
    if (!match) {
      session.buffer = session.buffer.subarray(bodyStart);
      continue;
    }

    const length = Number(match[1]);
    if (session.buffer.length < bodyStart + length) break;

    const body = session.buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
    session.buffer = session.buffer.subarray(bodyStart + length);
    try {
      messages.push(JSON.parse(body) as JsonRpcMessage);
    } catch {
      // Ignore malformed payloads.
    }
  }
  return messages;
}

export class LspManager {
  private readonly sessions = new Map<string, Session>();
  private seq = 0;

  constructor(private readonly spawn: SpawnLsp = defaultSpawn) {}

  start(
    language: Language,
    opts: { cwd?: string } = {},
    onMessage?: (id: string, message: JsonRpcMessage) => void,
  ): string {
    const spec = SERVERS[language];
    const id = `lsp-${++this.seq}`;
    const proc = this.spawn(spec.command, spec.args, { cwd: opts.cwd ?? process.cwd() });
    const session: Session = { proc, buffer: Buffer.alloc(0) };

    proc.stdout.on('data', (chunk) => {
      session.buffer = Buffer.concat([
        session.buffer,
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
      ]);
      for (const message of drain(session)) {
        onMessage?.(id, message);
      }
    });
    proc.on('exit', () => {
      this.sessions.delete(id);
    });

    this.sessions.set(id, session);
    return id;
  }

  send(id: string, message: JsonRpcMessage): void {
    this.sessions.get(id)?.proc.stdin.write(frame(message));
  }

  stop(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.proc.kill();
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
