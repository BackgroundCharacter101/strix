import { describe, it, expect } from 'vitest';
import { normalizeRemoteUrl, prCompareUrl } from './gitRemote';

describe('normalizeRemoteUrl', () => {
  it('normalizes https remotes and drops .git', () => {
    expect(normalizeRemoteUrl('https://github.com/acme/widget.git')).toBe(
      'https://github.com/acme/widget',
    );
  });

  it('converts scp-style ssh remotes to https', () => {
    expect(normalizeRemoteUrl('git@github.com:acme/widget.git')).toBe(
      'https://github.com/acme/widget',
    );
  });

  it('converts ssh:// remotes to https', () => {
    expect(normalizeRemoteUrl('ssh://git@github.com/acme/widget.git')).toBe(
      'https://github.com/acme/widget',
    );
  });

  it('upgrades http to https', () => {
    expect(normalizeRemoteUrl('http://github.com/acme/widget')).toBe(
      'https://github.com/acme/widget',
    );
  });

  it('returns null for junk', () => {
    expect(normalizeRemoteUrl('')).toBeNull();
    expect(normalizeRemoteUrl('not-a-url')).toBeNull();
  });
});

describe('prCompareUrl', () => {
  it('builds a compare URL with the branch', () => {
    expect(prCompareUrl('git@github.com:acme/widget.git', 'feature/x')).toBe(
      'https://github.com/acme/widget/compare/feature%2Fx?expand=1',
    );
  });

  it('returns null without a usable remote or branch', () => {
    expect(prCompareUrl('junk', 'main')).toBeNull();
    expect(prCompareUrl('https://github.com/a/b', '')).toBeNull();
  });
});
