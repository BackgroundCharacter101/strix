import { describe, it, expect } from 'vitest';
import { stripAnsi, parseFreebuffUsage, formatUsage } from './freebuffUsage';

const ESC = String.fromCharCode(27);

describe('stripAnsi', () => {
  it('removes colour codes but keeps the text', () => {
    expect(stripAnsi(`${ESC}[32m12 sessions left${ESC}[0m`)).toBe('12 sessions left');
  });
  it('leaves plain text untouched', () => {
    expect(stripAnsi('no escapes here ABC-Z_')).toBe('no escapes here ABC-Z_');
  });
});

describe('parseFreebuffUsage', () => {
  it('parses "X / Y sessions" and computes percent', () => {
    const u = parseFreebuffUsage('Usage: 12 / 50 sessions');
    expect(u).toMatchObject({ left: 12, total: 50, unit: 'sessions', percent: 24 });
  });
  it('parses "N requests left"', () => {
    const u = parseFreebuffUsage('You have 7 requests left today');
    expect(u).toMatchObject({ left: 7, unit: 'requests' });
  });
  it('parses a reset countdown', () => {
    const u = parseFreebuffUsage('Limit reached — resets in 2h 30m');
    expect(u?.resetLabel).toBe('2h 30m');
  });
  it('parses "used of" into remaining', () => {
    const u = parseFreebuffUsage('40 of 50 sessions used');
    expect(u).toMatchObject({ left: 10, total: 50, percent: 20 });
  });
  it('parses an explicit percent (used → remaining)', () => {
    expect(parseFreebuffUsage('22% used')?.percent).toBe(78);
    expect(parseFreebuffUsage('78% remaining')?.percent).toBe(78);
  });
  it('parses through ANSI colour', () => {
    const u = parseFreebuffUsage(`${ESC}[33m9 / 20 sessions${ESC}[0m, resets in 45m`);
    expect(u).toMatchObject({ left: 9, total: 20, resetLabel: '45m' });
  });
  it('returns null when there is nothing usage-like', () => {
    expect(parseFreebuffUsage('Welcome to FreeBuff! Type a prompt.')).toBeNull();
  });

  it('scrapes the model and per-session time from the status bar', () => {
    const u = parseFreebuffUsage('1 of 5 sessions used · resets in 16h 59m\nMiMo 2.5 · 1h left  × End session');
    expect(u).toMatchObject({ left: 4, total: 5, resetLabel: '16h 59m' });
    expect(u?.model).toMatch(/MiMo 2\.5/i);
    expect(u?.sessionLabel).toBe('1h left');
  });

  it('does not mistake "sessions left" for a session time', () => {
    expect(parseFreebuffUsage('5 sessions left')?.sessionLabel).toBeUndefined();
  });
});

describe('formatUsage', () => {
  it('summarises sessions + reset', () => {
    expect(formatUsage({ left: 12, total: 50, unit: 'sessions', resetLabel: '2h 30m' })).toBe(
      '12 / 50 sessions · resets in 2h 30m',
    );
  });
});
