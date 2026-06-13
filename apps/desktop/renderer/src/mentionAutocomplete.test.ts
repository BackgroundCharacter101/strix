import { describe, it, expect } from 'vitest';
import { activeMention, rankMentionCandidates, applyMention } from './mentionAutocomplete';

describe('activeMention', () => {
  it('detects a mention being typed at the caret', () => {
    const text = 'look at @src/au';
    expect(activeMention(text, text.length)).toEqual({ query: 'src/au', start: 8, end: 15 });
  });

  it('detects a bare @ with an empty query', () => {
    expect(activeMention('hi @', 4)).toEqual({ query: '', start: 3, end: 4 });
  });

  it('returns null when the caret is not in a mention', () => {
    expect(activeMention('plain text', 10)).toBeNull();
    expect(activeMention('done @src/a.ts now', 18)).toBeNull(); // caret after a space
  });

  it('requires whitespace (or start) before the @', () => {
    expect(activeMention('email@host', 10)).toBeNull();
  });

  it('normalizes backslashes in the query', () => {
    const text = '@src\\app';
    expect(activeMention(text, text.length)?.query).toBe('src/app');
  });

  it('only considers text up to the caret', () => {
    const text = '@auth.ts trailing';
    expect(activeMention(text, 5)).toEqual({ query: 'auth', start: 0, end: 5 });
  });
});

describe('rankMentionCandidates', () => {
  const paths = ['src/auth.ts', 'src/ui/button.tsx', 'README.md', 'src/auth/index.ts'];

  it('ranks basename matches above path matches', () => {
    const r = rankMentionCandidates('auth', paths);
    expect(r[0]).toBe('src/auth.ts'); // basename prefix + shortest
  });

  it('returns the first paths for an empty query', () => {
    expect(rankMentionCandidates('', paths, 2)).toEqual(['src/auth.ts', 'src/ui/button.tsx']);
  });

  it('respects the limit', () => {
    expect(rankMentionCandidates('s', paths, 1)).toHaveLength(1);
  });

  it('excludes non-matches', () => {
    expect(rankMentionCandidates('zzz', paths)).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(rankMentionCandidates('README', paths)).toEqual(['README.md']);
  });
});

describe('applyMention', () => {
  it('replaces the token with @path and a trailing space', () => {
    const text = 'see @au';
    const active = { query: 'au', start: 4, end: 7 };
    const r = applyMention(text, active, 'src/auth.ts');
    expect(r.text).toBe('see @src/auth.ts ');
    expect(r.caret).toBe(r.text.length);
  });

  it('preserves text after the token', () => {
    const text = 'see @au here';
    const active = { query: 'au', start: 4, end: 7 };
    const r = applyMention(text, active, 'src/auth.ts');
    expect(r.text).toBe('see @src/auth.ts  here');
    expect(r.caret).toBe(17); // just after the inserted '@src/auth.ts '
  });

  it('handles a bare @ at the end', () => {
    const text = 'context @';
    const active = { query: '', start: 8, end: 9 };
    const r = applyMention(text, active, 'a.ts');
    expect(r.text).toBe('context @a.ts ');
    expect(r.caret).toBe(r.text.length);
  });
});
