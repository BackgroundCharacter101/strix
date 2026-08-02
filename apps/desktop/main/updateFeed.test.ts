import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveFeedDir, resolveFeedFile } from './updateFeed';

const root = path.resolve('C:/feed');

describe('resolveFeedDir', () => {
  it('is off by default so public builds never open a server', () => {
    expect(resolveFeedDir({}, '')).toBeNull();
    expect(resolveFeedDir({ STRIX_UPDATE_SERVE_DIR: '   ' }, '')).toBeNull();
  });

  it('uses the baked folder, and lets the env override it', () => {
    expect(resolveFeedDir({}, 'C:/feed')).toBe(root);
    expect(resolveFeedDir({ STRIX_UPDATE_SERVE_DIR: 'C:/other' }, 'C:/feed')).toBe(
      path.resolve('C:/other'),
    );
  });
});

describe('resolveFeedFile', () => {
  it('serves manifests and installers inside the root', () => {
    expect(resolveFeedFile(root, '/latest-m1.json')).toBe(path.join(root, 'latest-m1.json'));
    // Installer names contain spaces, so the URL arrives percent-encoded.
    expect(resolveFeedFile(root, '/Strix%20M1%20Setup%200.2.13.exe')).toBe(
      path.join(root, 'Strix M1 Setup 0.2.13.exe'),
    );
  });

  it('ignores a query string', () => {
    expect(resolveFeedFile(root, '/latest-m1.json?t=1')).toBe(path.join(root, 'latest-m1.json'));
  });

  it('refuses to escape the feed folder', () => {
    expect(resolveFeedFile(root, '/../package.json')).toBeNull();
    expect(resolveFeedFile(root, '/../../Windows/System32/drivers/etc/hosts')).toBeNull();
    // Encoded traversal must be caught after decoding, not before.
    expect(resolveFeedFile(root, '/..%2f..%2fsecret.json')).toBeNull();
  });

  it('refuses anything that is not a manifest or an installer', () => {
    expect(resolveFeedFile(root, '/notes.txt')).toBeNull();
    expect(resolveFeedFile(root, '/script.ps1')).toBeNull();
    expect(resolveFeedFile(root, '/')).toBeNull();
  });

  it('returns null for malformed percent-encoding instead of throwing', () => {
    expect(resolveFeedFile(root, '/%E0%A4%A.json')).toBeNull();
  });
});
