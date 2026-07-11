import { describe, it, expect } from 'vitest';
import { computeLineHunks } from './dirtyDiff';

describe('computeLineHunks', () => {
  it('reports nothing for identical content (trailing newline ignored)', () => {
    expect(computeLineHunks('a\nb\nc', 'a\nb\nc')).toEqual([]);
    expect(computeLineHunks('a\nb\nc\n', 'a\nb\nc')).toEqual([]);
  });

  it('marks an added run of lines', () => {
    // Insert two lines after line 1.
    const hunks = computeLineHunks('a\nb', 'a\nx\ny\nb');
    expect(hunks).toContainEqual({ type: 'add', start: 2, end: 3 });
  });

  it('marks a modified line', () => {
    const hunks = computeLineHunks('a\nb\nc', 'a\nB\nc');
    expect(hunks).toContainEqual({ type: 'modify', start: 2, end: 2 });
  });

  it('marks a deletion', () => {
    // Remove line 2 → a delete marker near where it was.
    const hunks = computeLineHunks('a\nb\nc', 'a\nc');
    expect(hunks.some((h) => h.type === 'delete')).toBe(true);
  });

  it('treats a brand-new file (no head) as all added', () => {
    const hunks = computeLineHunks('', 'a\nb\nc');
    expect(hunks).toEqual([{ type: 'add', start: 1, end: 3 }]);
  });
});
