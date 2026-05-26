import { describe, it, expect } from 'vitest';
import { roomForPath, pickUserColor } from './collab';

describe('roomForPath', () => {
  it('sanitizes a path into a stable room id', () => {
    expect(roomForPath('/ws/src/a.ts')).toBe('__ws__src__a.ts');
    expect(roomForPath('C:\\proj\\b.py')).toBe('C__proj__b.py');
  });

  it('falls back to "untitled" for empty input', () => {
    expect(roomForPath('')).toBe('untitled');
  });
});

describe('pickUserColor', () => {
  it('is deterministic and returns a hex color', () => {
    const c = pickUserColor('alice');
    expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    expect(pickUserColor('alice')).toBe(c);
  });
});
