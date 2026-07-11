import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildManifest, sha256File } from './update-publish.mjs';

describe('buildManifest', () => {
  it('composes url from feed base + filename and trims trailing slashes', () => {
    const m = buildManifest({
      version: '0.2.0',
      fileName: 'Strix M1 Setup 0.2.0.exe',
      sha256: 'a'.repeat(64),
      feedBase: 'http://localhost:8787/',
    });
    expect(m.url).toBe('http://localhost:8787/Strix M1 Setup 0.2.0.exe');
    expect(m.version).toBe('0.2.0');
    expect(m.mandatory).toBe(false);
    expect(typeof m.pubDate).toBe('string');
  });
});

describe('sha256File', () => {
  it('hashes file contents to lowercase hex', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'strix-pub-'));
    const f = path.join(dir, 'a.bin');
    writeFileSync(f, 'hello');
    const expected = createHash('sha256').update('hello').digest('hex');
    expect(await sha256File(f)).toBe(expected);
  });
});
