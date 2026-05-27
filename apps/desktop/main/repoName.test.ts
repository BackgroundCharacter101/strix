import { describe, it, expect } from 'vitest';
import { repoNameFromUrl } from './repoName';

describe('repoNameFromUrl', () => {
  it('strips a trailing .git', () => {
    expect(repoNameFromUrl('https://github.com/acme/strix.git')).toBe('strix');
  });

  it('works without a .git suffix', () => {
    expect(repoNameFromUrl('https://github.com/acme/strix')).toBe('strix');
  });

  it('ignores trailing slashes', () => {
    expect(repoNameFromUrl('https://github.com/acme/strix/')).toBe('strix');
  });

  it('handles SSH-style URLs', () => {
    expect(repoNameFromUrl('git@github.com:acme/my-repo.git')).toBe('my-repo');
  });

  it('falls back to "repo" for empty input', () => {
    expect(repoNameFromUrl('')).toBe('repo');
  });
});
