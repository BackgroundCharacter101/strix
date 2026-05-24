import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalManager, type PtyProcess, type SpawnFn } from './terminal';

interface FakePty {
  proc: PtyProcess;
  emitData: (data: string) => void;
  emitExit: (exitCode: number) => void;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
}

function makeFakePty(): FakePty {
  let dataCb: ((data: string) => void) | undefined;
  let exitCb: ((e: { exitCode: number }) => void) | undefined;
  const write = vi.fn();
  const resize = vi.fn();
  const kill = vi.fn();
  return {
    proc: {
      onData: (cb) => {
        dataCb = cb;
      },
      onExit: (cb) => {
        exitCb = cb;
      },
      write,
      resize,
      kill,
    },
    emitData: (data) => dataCb?.(data),
    emitExit: (exitCode) => exitCb?.({ exitCode }),
    write,
    resize,
    kill,
  };
}

let fake: FakePty;
let spawn: SpawnFn & ReturnType<typeof vi.fn>;
let manager: TerminalManager;

beforeEach(() => {
  fake = makeFakePty();
  spawn = vi.fn(() => fake.proc) as SpawnFn & ReturnType<typeof vi.fn>;
  manager = new TerminalManager(spawn);
});

describe('TerminalManager', () => {
  it('spawns a session and returns a unique id, passing through options', () => {
    const id = manager.create({ shell: 'bash', cwd: '/work', cols: 100, rows: 30 });
    expect(id).toBe('term-1');
    expect(manager.has(id)).toBe(true);
    expect(spawn).toHaveBeenCalledWith('bash', { cwd: '/work', cols: 100, rows: 30 });
    expect(manager.create()).toBe('term-2');
  });

  it('routes pty output to the onData callback with the session id', () => {
    const onData = vi.fn();
    const id = manager.create({}, onData);
    fake.emitData('hello');
    expect(onData).toHaveBeenCalledWith(id, 'hello');
  });

  it('forwards write and resize to the underlying pty', () => {
    const id = manager.create();
    manager.write(id, 'ls\n');
    manager.resize(id, 120, 40);
    expect(fake.write).toHaveBeenCalledWith('ls\n');
    expect(fake.resize).toHaveBeenCalledWith(120, 40);
  });

  it('kills a session, removes it, and ignores writes afterward', () => {
    const id = manager.create();
    manager.kill(id);
    expect(fake.kill).toHaveBeenCalled();
    expect(manager.has(id)).toBe(false);
    manager.write(id, 'x'); // no throw, no-op
    expect(fake.write).not.toHaveBeenCalled();
  });

  it('drops the session and fires onExit when the pty exits', () => {
    const onExit = vi.fn();
    const id = manager.create({}, undefined, onExit);
    expect(manager.count).toBe(1);
    fake.emitExit(0);
    expect(onExit).toHaveBeenCalledWith(id, 0);
    expect(manager.has(id)).toBe(false);
    expect(manager.count).toBe(0);
  });
});
