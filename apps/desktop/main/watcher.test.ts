import { describe, it, expect } from 'vitest';
import { shouldIgnore } from './watcher';

describe('shouldIgnore', () => {
  it('ignores build/VCS/dep dirs', () => {
    expect(shouldIgnore('node_modules/react/index.js')).toBe(true);
    expect(shouldIgnore('.git/HEAD')).toBe(true);
    expect(shouldIgnore('dist/main/index.cjs')).toBe(true);
    expect(shouldIgnore('src/node_modules/x')).toBe(true);
    expect(shouldIgnore('release/m1/app.asar')).toBe(true);
  });

  it('ignores scratch/temp files', () => {
    expect(shouldIgnore('a.tmp')).toBe(true);
    expect(shouldIgnore('file~')).toBe(true);
    expect(shouldIgnore('.DS_Store')).toBe(true);
  });

  it('keeps real source files', () => {
    expect(shouldIgnore('src/App.tsx')).toBe(false);
    expect(shouldIgnore('index.html')).toBe(false);
    expect(shouldIgnore('lib/util.py')).toBe(false);
  });

  it('treats empty as ignorable', () => {
    expect(shouldIgnore('')).toBe(true);
  });
});
