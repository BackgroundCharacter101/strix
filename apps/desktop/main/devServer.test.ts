import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { detectServerUrl, startDevServer, stopDevServer, devServerStatus } from './devServer';

describe('detectServerUrl', () => {
  it('picks the URL from real dev-server banners', () => {
    expect(detectServerUrl('  ➜  Local:   http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(detectServerUrl('started server on 0.0.0.0:3000, url: http://localhost:3000')).toBe(
      'http://localhost:3000',
    );
    expect(detectServerUrl('Now listening on http://127.0.0.1:8080/app')).toBe('http://127.0.0.1:8080/app');
    expect(detectServerUrl('  ○ Local:  http://0.0.0.0:4200/')).toBe('http://localhost:4200/');
  });
  it('returns null when there is no URL', () => {
    expect(detectServerUrl('Compiling...\nwatching for file changes')).toBeNull();
  });
});

// A fake ChildProcess we can drive from the test.
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 4321;
  return child;
}

describe('startDevServer', () => {
  it('spawns the command in the root and emits the URL once detected', () => {
    const child = fakeChild();
    const spawnImpl = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
    const onUrl = vi.fn();
    const onLog = vi.fn();

    const status = startDevServer('C:/proj', 'npm run dev', { onUrl, onLog }, spawnImpl);
    expect(spawnImpl).toHaveBeenCalledWith('npm run dev', expect.objectContaining({ cwd: 'C:/proj', shell: true }));
    expect(status.running).toBe(true);
    expect(devServerStatus().url).toBeNull();

    // URL split across two chunks — the rolling tail still matches it.
    child.stdout.emit('data', Buffer.from('  ➜  Local:   http://localhost:'));
    child.stdout.emit('data', Buffer.from('5173/\n'));
    expect(onUrl).toHaveBeenCalledWith('http://localhost:5173/');
    expect(onUrl).toHaveBeenCalledTimes(1);
    expect(devServerStatus().url).toBe('http://localhost:5173/');
    expect(onLog).toHaveBeenCalled();

    // Further output does not re-emit the URL.
    child.stdout.emit('data', Buffer.from('ready in 300ms http://localhost:9999/'));
    expect(onUrl).toHaveBeenCalledTimes(1);

    stopDevServer();
    expect(devServerStatus().running).toBe(false);
  });

  it('resets status when the process exits', () => {
    const child = fakeChild();
    const spawnImpl = vi.fn(() => child) as unknown as typeof import('node:child_process').spawn;
    const onExit = vi.fn();
    startDevServer('C:/proj', 'npm run dev', { onExit }, spawnImpl);
    child.emit('exit', 1);
    expect(onExit).toHaveBeenCalledWith(1);
    expect(devServerStatus()).toEqual({ running: false, url: null, command: null, root: null });
  });
});
