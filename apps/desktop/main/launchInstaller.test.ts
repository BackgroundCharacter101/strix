import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'fs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { launchInstaller, UAC_DECLINED } from './launchInstaller';

let tmp: string;

beforeEach(async () => {
  tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'strix-launch-'));
});
afterEach(async () => {
  await fsp.rm(tmp, { recursive: true, force: true });
});

const logPath = () => path.join(tmp, 'install.log');

describe('launchInstaller', () => {
  it('reports failure instead of throwing when the installer is missing', async () => {
    // The old code spawned with no 'error' listener, so this was invisible and
    // the app quit anyway.
    const res = await launchInstaller(path.join(tmp, 'nope.exe'), ['/S'], true, {
      logPath: logPath(),
      timeoutMs: 5_000,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/could not start the installer/i);
  });

  it('treats "exited without ever writing a log" as a declined elevation', async () => {
    // cmd.exe exits non-zero without creating the log — the shape of a refused
    // UAC prompt.
    const res = await launchInstaller('cmd.exe', ['/c', 'exit 1'], true, {
      logPath: logPath(),
      timeoutMs: 5_000,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe(UAC_DECLINED);
  });

  it('does not call a silent no-op a success', async () => {
    const res = await launchInstaller('cmd.exe', ['/c', 'exit 0'], true, {
      logPath: logPath(),
      timeoutMs: 5_000,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/exited without installing/i);
  });

  it('succeeds as soon as the install log appears, without waiting for exit', async () => {
    const log = logPath();
    // Stand-in for Inno: read the /LOG= argument the implementation appends,
    // write it, then keep running the way a real install does. Resolving here
    // proves we key off the log and not process exit.
    const script =
      "const fs=require('fs');" +
      "const a=process.argv.find(s=>s.startsWith('/LOG='));" +
      "fs.writeFileSync(a.slice(5),'installing');" +
      'setTimeout(() => {}, 30000);';
    const started = Date.now();
    const res = await launchInstaller(process.execPath, ['-e', script], true, {
      logPath: log,
      timeoutMs: 10_000,
      pollMs: 50,
    });
    expect(res.ok).toBe(true);
    expect(res.logPath).toBe(log);
    // It resolved while the stand-in was still running, not after 30s.
    expect(Date.now() - started).toBeLessThan(9_000);
  }, 15_000);

  it('clears a stale log so a previous run cannot fake success', async () => {
    const log = logPath();
    fs.writeFileSync(log, 'log from an earlier attempt');
    const res = await launchInstaller('cmd.exe', ['/c', 'exit 1'], true, {
      logPath: log,
      timeoutMs: 5_000,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe(UAC_DECLINED);
  });

  it('times out rather than hanging on an unanswered prompt', async () => {
    // Runs forever and never writes a log — an unanswered UAC dialog.
    // The budget must clear node's own startup (which can take several hundred
    // ms under a loaded suite) or this races and reports a spawn error instead.
    const res = await launchInstaller(process.execPath, ['-e', 'setTimeout(() => {}, 30000);'], true, {
      logPath: logPath(),
      timeoutMs: 2_000,
      pollMs: 50,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/timed out/i);
  }, 10_000);

  it('per-user path succeeds on spawn, with no log to wait for', async () => {
    const res = await launchInstaller('cmd.exe', ['/c', 'exit 0'], false);
    expect(res.ok).toBe(true);
  });
});
