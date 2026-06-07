import { describe, it, expect } from 'vitest';
import { parseScaffold, isSafeRelPath, looksLikeBuildRequest } from './scaffold';

describe('looksLikeBuildRequest', () => {
  it('detects build/create requests', () => {
    expect(looksLikeBuildRequest('make a program that scans my network')).toBe(true);
    expect(looksLikeBuildRequest('build a react todo app')).toBe(true);
    expect(looksLikeBuildRequest('create a CLI tool in python')).toBe(true);
  });
  it('ignores questions and edits', () => {
    expect(looksLikeBuildRequest('what does this function do?')).toBe(false);
    expect(looksLikeBuildRequest('explain this code')).toBe(false);
    expect(looksLikeBuildRequest('fix this bug')).toBe(false);
  });
});

describe('isSafeRelPath', () => {
  it('accepts simple relative paths', () => {
    expect(isSafeRelPath('src/index.ts')).toBe(true);
    expect(isSafeRelPath('README.md')).toBe(true);
  });
  it('rejects traversal, absolute, and drive paths', () => {
    expect(isSafeRelPath('../secrets')).toBe(false);
    expect(isSafeRelPath('/etc/passwd')).toBe(false);
    expect(isSafeRelPath('C:/Windows/system32')).toBe(false);
    expect(isSafeRelPath('a/../../b')).toBe(false);
    expect(isSafeRelPath('')).toBe(false);
  });
});

describe('parseScaffold', () => {
  it('parses a plain JSON plan', () => {
    const out = parseScaffold('{"files":[{"path":"a.ts","content":"x"}],"notes":"hi"}');
    expect('files' in out && out.files).toEqual([{ path: 'a.ts', content: 'x' }]);
    expect('notes' in out && out.notes).toBe('hi');
  });
  it('parses JSON wrapped in a code fence and surrounding prose', () => {
    const reply = 'Sure!\n```json\n{"files":[{"path":"src/app.ts","content":"1"}]}\n```\nDone.';
    const out = parseScaffold(reply);
    expect('files' in out && out.files[0].path).toBe('src/app.ts');
  });
  it('rejects a plan with an unsafe path', () => {
    const out = parseScaffold('{"files":[{"path":"../evil","content":"x"}]}');
    expect('error' in out).toBe(true);
  });
  it('errors when there is no JSON', () => {
    expect('error' in parseScaffold('no json here')).toBe(true);
  });
  it('enforces the file cap', () => {
    const files = Array.from({ length: 5 }, (_, i) => ({ path: `f${i}.ts`, content: '' }));
    const out = parseScaffold(JSON.stringify({ files }), { maxFiles: 3 });
    expect('error' in out).toBe(true);
  });
});
