import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LspManager, type JsonRpcMessage, type LspProcess, type SpawnLsp } from './lsp';

interface FakeProc {
  proc: LspProcess;
  emit: (data: Buffer | string) => void;
  exit: () => void;
  writes: string[];
  kill: ReturnType<typeof vi.fn>;
}

function makeFakeProc(): FakeProc {
  let dataCb: ((chunk: Buffer | string) => void) | undefined;
  let exitCb: ((code: number | null) => void) | undefined;
  const writes: string[] = [];
  const kill = vi.fn();
  return {
    proc: {
      stdin: { write: (d) => writes.push(d) },
      stdout: { on: (_event, cb) => (dataCb = cb) },
      on: (_event, cb) => (exitCb = cb),
      kill,
    },
    emit: (data) => dataCb?.(data),
    exit: () => exitCb?.(0),
    writes,
    kill,
  };
}

function frameOf(message: JsonRpcMessage): string {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
}

let fake: FakeProc;
let spawn: SpawnLsp & ReturnType<typeof vi.fn>;
let manager: LspManager;

beforeEach(() => {
  fake = makeFakeProc();
  spawn = vi.fn(() => fake.proc) as SpawnLsp & ReturnType<typeof vi.fn>;
  manager = new LspManager(spawn);
});

describe('LspManager', () => {
  it('spawns the right server command per language', () => {
    const id = manager.start('python');
    expect(id).toBe('lsp-1');
    expect(spawn).toHaveBeenCalledWith('pylsp', [], expect.objectContaining({ cwd: expect.any(String) }));

    manager.start('typescript');
    expect(spawn).toHaveBeenLastCalledWith(
      'typescript-language-server',
      ['--stdio'],
      expect.any(Object),
    );
  });

  it('frames outgoing messages with a Content-Length header', () => {
    const id = manager.start('typescript');
    manager.send(id, { jsonrpc: '2.0', id: 1, method: 'initialize' });

    const written = fake.writes[0];
    expect(written).toMatch(/^Content-Length: \d+\r\n\r\n/);
    const body = written.slice(written.indexOf('\r\n\r\n') + 4);
    expect(JSON.parse(body)).toMatchObject({ method: 'initialize' });
  });

  it('parses framed server output and routes it to onMessage', () => {
    const onMessage = vi.fn();
    const id = manager.start('typescript', {}, onMessage);

    fake.emit(Buffer.from(frameOf({ jsonrpc: '2.0', id: 1, result: { ok: true } })));

    expect(onMessage).toHaveBeenCalledWith(id, { jsonrpc: '2.0', id: 1, result: { ok: true } });
  });

  it('reassembles a message split across chunks', () => {
    const onMessage = vi.fn();
    const id = manager.start('python', {}, onMessage);
    const full = frameOf({ jsonrpc: '2.0', method: 'window/logMessage' });

    fake.emit(Buffer.from(full.slice(0, 12)));
    expect(onMessage).not.toHaveBeenCalled();
    fake.emit(Buffer.from(full.slice(12)));

    expect(onMessage).toHaveBeenCalledWith(id, { jsonrpc: '2.0', method: 'window/logMessage' });
  });

  it('stops a session, killing the process and ignoring later sends', () => {
    const id = manager.start('bash');
    manager.stop(id);
    expect(fake.kill).toHaveBeenCalled();
    expect(manager.has(id)).toBe(false);

    manager.send(id, { jsonrpc: '2.0', method: 'noop' });
    expect(fake.writes).toHaveLength(0);
  });

  it('drops the session when the process exits', () => {
    const id = manager.start('python');
    expect(manager.count).toBe(1);
    fake.exit();
    expect(manager.has(id)).toBe(false);
  });
});
