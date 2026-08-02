import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '..', 'tokens.css'), 'utf8');

function tokenValue(name: string): string | null {
  // First definition wins — that is the :root (dark) block.
  const m = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(css);
  return m ? m[1].trim() : null;
}

describe('control tokens', () => {
  it('defines one control height, radius, and panel gutter', () => {
    expect(tokenValue('--control-h')).toBe('28px');
    expect(tokenValue('--control-h-sm')).toBe('22px');
    expect(tokenValue('--control-radius')).toBe('7px');
    expect(tokenValue('--card-radius')).toBe('10px');
    expect(tokenValue('--field-h')).toBe('28px');
    expect(tokenValue('--panel-gutter')).toBe('12px');
    expect(tokenValue('--panel-gap')).toBe('8px');
    expect(tokenValue('--section-gap')).toBe('16px');
  });
});

describe('type scale', () => {
  it('no longer bottoms out at 9px', () => {
    const smallest = Number((tokenValue('--text-2xs') ?? '').replace('px', ''));
    expect(smallest).toBeGreaterThanOrEqual(10);
  });

  it('keeps the readable steps the panels should use', () => {
    expect(tokenValue('--text-xs')).toBe('11px');
    expect(tokenValue('--text-sm')).toBe('12px');
    expect(tokenValue('--text-base')).toBe('13px');
  });
});
