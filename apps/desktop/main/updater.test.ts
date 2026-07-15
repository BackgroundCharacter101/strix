import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  compareVersions,
  parseManifest,
  checkForUpdate,
  downloadAndVerify,
  isSystemInstall,
} from './updater';

// A Response-like with a real ReadableStream body (mirrors aiProxy.test.ts).
function fakeResponse(bytes: Uint8Array, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => new TextDecoder().decode(bytes),
    headers: { get: (n: string) => (n === 'content-length' ? String(bytes.length) : null) },
    body: new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes);
        c.close();
      },
    }),
  };
}

const sha = (b: Uint8Array) => createHash('sha256').update(Buffer.from(b)).digest('hex');

describe('compareVersions', () => {
  it('orders versions numerically, not lexically', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1);
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1); // not string compare
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
  });
  it('tolerates missing segments + pre-release suffixes', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('0.2.0-beta', '0.1.0')).toBe(1);
  });
});

describe('isSystemInstall', () => {
  const PF = ['C:\\Program Files', 'C:\\Program Files (x86)'];
  it('is true for an all-users (Program Files) install', () => {
    expect(isSystemInstall('C:\\Program Files\\Strix M1\\Strix M1.exe', PF)).toBe(true);
    expect(isSystemInstall('C:/Program Files (x86)/Strix M1/Strix M1.exe', PF)).toBe(true);
  });
  it('is false for a per-user (LocalAppData) install', () => {
    expect(
      isSystemInstall('C:\\Users\\kavee\\AppData\\Local\\Programs\\Strix M1\\Strix M1.exe', PF),
    ).toBe(false);
  });
  it('ignores undefined Program Files env entries', () => {
    expect(isSystemInstall('C:\\Program Files\\Strix\\a.exe', [undefined, 'C:\\Program Files'])).toBe(true);
  });
});

describe('parseManifest', () => {
  const good = JSON.stringify({
    version: '0.2.0',
    url: 'http://localhost:8787/Strix-Setup-0.2.0.exe',
    sha256: 'a'.repeat(64),
    notes: 'hi',
    mandatory: true,
  });
  it('parses a valid manifest', () => {
    const m = parseManifest(good);
    expect(m.version).toBe('0.2.0');
    expect(m.mandatory).toBe(true);
  });
  it('rejects invalid JSON', () => {
    expect(() => parseManifest('{not json')).toThrow(/valid JSON/);
  });
  it('rejects a bad url', () => {
    expect(() => parseManifest(JSON.stringify({ version: '1', url: 'ftp://x', sha256: 'a'.repeat(64) }))).toThrow(
      /url/,
    );
  });
  it('rejects a non-64-hex sha256', () => {
    expect(() => parseManifest(JSON.stringify({ version: '1', url: 'http://x/y', sha256: 'zz' }))).toThrow(
      /sha256/,
    );
  });
});

describe('checkForUpdate', () => {
  const manifest = (v: string) =>
    fakeResponse(new TextEncoder().encode(JSON.stringify({ version: v, url: 'http://h/s.exe', sha256: 'a'.repeat(64) })));

  it('requests the edition-specific manifest and flags a newer version', async () => {
    const fetchImpl = vi.fn(async () => manifest('0.2.0'));
    const r = await checkForUpdate({ feedURL: 'http://h/', edition: 'm1', currentVersion: '0.1.0', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith('http://h/latest-m1.json');
    expect(r.available).toBe(true);
    expect(r.manifest?.version).toBe('0.2.0');
  });
  it('reports no update when the server version is equal/older', async () => {
    const fetchImpl = vi.fn(async () => manifest('0.1.0'));
    const r = await checkForUpdate({ feedURL: 'http://h', edition: 'm1', currentVersion: '0.1.0', fetchImpl });
    expect(r.available).toBe(false);
  });
  it('offers a same-version build with a different buildId (a republish)', async () => {
    const m = (v: string, buildId: string) =>
      fakeResponse(new TextEncoder().encode(JSON.stringify({ version: v, url: 'http://h/s.exe', sha256: 'a'.repeat(64), buildId })));
    // Same version, different build → available.
    const r = await checkForUpdate({
      feedURL: 'http://h', edition: 'm1', currentVersion: '0.2.4', currentBuildId: 'aaa111',
      fetchImpl: vi.fn(async () => m('0.2.4', 'bbb222')),
    });
    expect(r.available).toBe(true);
    // Same version, same build → not available.
    const r2 = await checkForUpdate({
      feedURL: 'http://h', edition: 'm1', currentVersion: '0.2.4', currentBuildId: 'aaa111',
      fetchImpl: vi.fn(async () => m('0.2.4', 'aaa111')),
    });
    expect(r2.available).toBe(false);
  });
  it('never offers a downgrade even with a different buildId', async () => {
    const m = fakeResponse(new TextEncoder().encode(JSON.stringify({ version: '0.2.0', url: 'http://h/s.exe', sha256: 'a'.repeat(64), buildId: 'zzz999' })));
    const r = await checkForUpdate({
      feedURL: 'http://h', edition: 'm1', currentVersion: '0.2.4', currentBuildId: 'aaa111',
      fetchImpl: vi.fn(async () => m),
    });
    expect(r.available).toBe(false);
  });

  it('throws on an HTTP error (surfaced as an error event by the caller)', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(new Uint8Array(), false, 500));
    await expect(
      checkForUpdate({ feedURL: 'http://h', edition: 'competition', currentVersion: '0.1.0', fetchImpl }),
    ).rejects.toThrow(/HTTP 500/);
  });
});

describe('downloadAndVerify', () => {
  it('writes the file and returns its path when the checksum matches', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'strix-upd-'));
    try {
      const bytes = new TextEncoder().encode('fake installer bytes');
      const dest = path.join(dir, 'setup.exe');
      const onProgress = vi.fn();
      const out = await downloadAndVerify({
        url: 'http://h/s.exe',
        sha256: sha(bytes),
        destPath: dest,
        fetchImpl: async () => fakeResponse(bytes),
        onProgress,
      });
      expect(out).toBe(dest);
      expect(await readFile(dest)).toEqual(Buffer.from(bytes));
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress.mock.calls.at(-1)?.[0].percent).toBe(100);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('deletes the file and throws on a checksum mismatch (never runs a bad installer)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'strix-upd-'));
    try {
      const bytes = new TextEncoder().encode('tampered');
      const dest = path.join(dir, 'setup.exe');
      await expect(
        downloadAndVerify({
          url: 'http://h/s.exe',
          sha256: 'b'.repeat(64), // wrong
          destPath: dest,
          fetchImpl: async () => fakeResponse(bytes),
        }),
      ).rejects.toThrow(/checksum mismatch/);
      await expect(readFile(dest)).rejects.toThrow(); // removed
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
