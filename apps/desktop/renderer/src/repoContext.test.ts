import { describe, it, expect } from 'vitest';
import {
  tokenize,
  scoreFile,
  rankFiles,
  formatRepoContext,
  extractMentions,
  resolveMentions,
} from './repoContext';

describe('tokenize', () => {
  it('extracts lowercase identifier tokens (≥2 chars)', () => {
    expect(tokenize('Fix the AuthService.login() bug')).toEqual([
      'fix',
      'the',
      'authservice',
      'login',
      'bug',
    ]);
  });
});

describe('scoreFile', () => {
  it('weights a path match above content hits', () => {
    const path = scoreFile(['auth'], { path: 'src/auth.ts', content: 'nothing' });
    const content = scoreFile(['auth'], { path: 'src/x.ts', content: 'auth' });
    expect(path).toBeGreaterThan(content);
  });
  it('caps content hits per term', () => {
    const many = 'auth '.repeat(100);
    expect(scoreFile(['auth'], { path: 'x.ts', content: many })).toBeLessThanOrEqual(20);
  });
});

describe('rankFiles', () => {
  const files = [
    { path: 'src/auth.ts', content: 'export function login() { return token; }' },
    { path: 'src/ui/button.tsx', content: 'export const Button = () => null;' },
    { path: 'README.md', content: 'Login flow and auth tokens are described here. auth auth.' },
  ];

  it('ranks the most relevant files first', () => {
    const r = rankFiles('how does login auth work', files);
    expect(r[0].path).toBe('src/auth.ts');
    expect(r.map((f) => f.path)).not.toContain('src/ui/button.tsx');
  });

  it('respects the file-count budget', () => {
    expect(rankFiles('auth login', files, { maxFiles: 1 })).toHaveLength(1);
  });

  it('respects the byte budget', () => {
    const big = [
      { path: 'a.ts', content: 'auth '.repeat(5000) },
      { path: 'b.ts', content: 'auth login' },
    ];
    const r = rankFiles('auth', big, { maxBytes: 100 });
    expect(r.length).toBe(1); // first file already exceeds the budget
  });

  it('returns nothing for a token-less query or no match', () => {
    expect(rankFiles('!!!', files)).toEqual([]);
    expect(rankFiles('zzzznomatch', files)).toEqual([]);
  });
});

describe('extractMentions', () => {
  it('pulls path-like @mentions and trims trailing punctuation', () => {
    expect(extractMentions('explain @src/auth.ts and @lib/db.py, please')).toEqual([
      'src/auth.ts',
      'lib/db.py',
    ]);
  });
  it('ignores @words that are not path-like', () => {
    expect(extractMentions('hey @everyone look')).toEqual([]);
  });
  it('normalizes backslashes', () => {
    expect(extractMentions('@src\\app.tsx')).toEqual(['src/app.tsx']);
  });
});

describe('resolveMentions', () => {
  const files = [
    { path: 'src/auth.ts', content: 'a' },
    { path: 'src/ui/button.tsx', content: 'b' },
  ];
  it('matches by full path, suffix, or basename', () => {
    expect(resolveMentions(['src/auth.ts'], files).map((f) => f.path)).toEqual(['src/auth.ts']);
    expect(resolveMentions(['auth.ts'], files).map((f) => f.path)).toEqual(['src/auth.ts']);
    expect(resolveMentions(['ui/button.tsx'], files).map((f) => f.path)).toEqual([
      'src/ui/button.tsx',
    ]);
  });
  it('ignores unmatched mentions and de-dupes', () => {
    expect(resolveMentions(['nope.ts', 'auth.ts', 'auth.ts'], files).map((f) => f.path)).toEqual([
      'src/auth.ts',
    ]);
  });
});

describe('formatRepoContext', () => {
  it('is empty for no files', () => {
    expect(formatRepoContext([])).toBe('');
  });
  it('fences each file with its path', () => {
    const out = formatRepoContext([{ path: 'a.ts', content: 'x', score: 1 }]);
    expect(out).toContain('File: a.ts');
    expect(out).toContain('```\nx\n```');
  });
});
