import { describe, it, expect } from 'vitest';
import { eventAccelerator, resolveKey, buildKeymap } from './keybindings';

const ev = (over: Partial<Parameters<typeof eventAccelerator>[0]>) =>
  eventAccelerator({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, key: '', ...over });

describe('eventAccelerator', () => {
  it('serializes ctrl + key, uppercasing letters', () => {
    expect(ev({ ctrlKey: true, key: 's' })).toBe('Ctrl+S');
  });
  it('treats Cmd (meta) as Ctrl', () => {
    expect(ev({ metaKey: true, key: 'p' })).toBe('Ctrl+P');
  });
  it('orders modifiers Ctrl+Shift+Alt', () => {
    expect(ev({ ctrlKey: true, shiftKey: true, altKey: true, key: 'f' })).toBe('Ctrl+Shift+Alt+F');
  });
  it('keeps symbol keys as-is', () => {
    expect(ev({ ctrlKey: true, key: '`' })).toBe('Ctrl+`');
    expect(ev({ ctrlKey: true, key: '\\' })).toBe('Ctrl+\\');
  });
});

describe('resolveKey', () => {
  it('returns the default when no override', () => {
    expect(resolveKey('save')).toBe('Ctrl+S');
  });
  it('returns the override when set', () => {
    expect(resolveKey('save', { save: 'Ctrl+Shift+S' })).toBe('Ctrl+Shift+S');
  });
});

describe('buildKeymap', () => {
  it('maps accelerators to command ids, honoring overrides', () => {
    const map = buildKeymap({ toggleSidebar: 'Ctrl+Shift+B' });
    expect(map.get('Ctrl+S')).toBe('save');
    expect(map.get('Ctrl+Shift+B')).toBe('toggleSidebar');
    expect(map.get('Ctrl+B')).toBeUndefined();
  });
});
