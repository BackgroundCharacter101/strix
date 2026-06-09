import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  resolveStaticPath,
  contentTypeFor,
  startStaticServer,
  stopStaticServer,
} from './staticServer';

describe('resolveStaticPath', () => {
  const root = path.resolve('/srv/site');

  it('resolves normal paths under root', () => {
    expect(resolveStaticPath(root, '/index.html')).toBe(path.join(root, 'index.html'));
    expect(resolveStaticPath(root, '/css/app.css')).toBe(path.join(root, 'css', 'app.css'));
  });

  it('maps "/" to the root dir', () => {
    expect(resolveStaticPath(root, '/')).toBe(root);
  });

  it('blocks path traversal outside root', () => {
    expect(resolveStaticPath(root, '/../secret')).toBeNull();
    expect(resolveStaticPath(root, '/../../etc/passwd')).toBeNull();
    expect(resolveStaticPath(root, '/%2e%2e/secret')).toBeNull();
  });

  it('strips query and hash', () => {
    expect(resolveStaticPath(root, '/index.html?x=1#y')).toBe(path.join(root, 'index.html'));
  });
});

describe('contentTypeFor', () => {
  it('maps common extensions', () => {
    expect(contentTypeFor('a.html')).toMatch(/text\/html/);
    expect(contentTypeFor('a.js')).toMatch(/javascript/);
    expect(contentTypeFor('a.css')).toMatch(/text\/css/);
    expect(contentTypeFor('a.png')).toBe('image/png');
  });
  it('falls back to octet-stream', () => {
    expect(contentTypeFor('a.unknownext')).toBe('application/octet-stream');
  });
});

describe('startStaticServer', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'strix-serve-'));
  writeFileSync(path.join(dir, 'index.html'), '<h1>hello strix</h1>');

  afterAll(() => {
    stopStaticServer();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html on 127.0.0.1 and reuses per root', async () => {
    const info = await startStaticServer(dir);
    expect(info.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(info.port).toBeGreaterThan(0);

    const res = await fetch(`${info.url}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('hello strix');

    // Idempotent: same root returns the same server.
    const again = await startStaticServer(dir);
    expect(again.port).toBe(info.port);
  });

  it('404s a missing file', async () => {
    const info = await startStaticServer(dir);
    const res = await fetch(`${info.url}/nope.html`);
    expect(res.status).toBe(404);
  });
});
