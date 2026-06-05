import { describe, it, expect } from 'vitest';
import { materialFileStyle, materialFolderColor } from './materialIcons';

describe('materialFileStyle', () => {
  it('maps known extensions to a colour and monogram', () => {
    expect(materialFileStyle('app.ts').label).toBe('TS');
    expect(materialFileStyle('app.tsx').label).toBe('TS'); // aliased
    expect(materialFileStyle('main.py').label).toBe('PY');
    expect(materialFileStyle('main.py').color).toBe('#3572A5');
  });

  it('prefers whole-filename matches', () => {
    expect(materialFileStyle('package.json').label).toBe('npm');
    expect(materialFileStyle('.gitignore').label).toBe('git');
  });

  it('falls back for unknown extensions', () => {
    expect(materialFileStyle('weird.zzz').label).toBe('·');
  });
});

describe('materialFolderColor', () => {
  it('gives well-known folders their own accent', () => {
    expect(materialFolderColor('src')).toBe('#42a5f5');
    expect(materialFolderColor('node_modules')).toBe('#8bc34a');
  });

  it('uses a neutral colour otherwise', () => {
    expect(materialFolderColor('whatever')).toBe('#5c84b1');
  });
});
