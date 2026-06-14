import { describe, it, expect } from 'vitest';
import { extractSymbols, filterSymbols, languageOfPath } from './symbols';

describe('languageOfPath', () => {
  it('maps extensions to language buckets', () => {
    expect(languageOfPath('a.tsx')).toBe('ts');
    expect(languageOfPath('a.py')).toBe('py');
    expect(languageOfPath('README.md')).toBe('md');
    expect(languageOfPath('a.scss')).toBe('css');
    expect(languageOfPath('a.bin')).toBe('other');
  });
});

describe('extractSymbols (ts/js)', () => {
  const src = [
    'export class Foo {', // 1
    '  constructor() {}', // 2 (skipped)
    '  bar() {', // 3 method
    '    if (x) {', // 4 (skipped)
    '  }', //
    '}', //
    'export function baz() {}', // 7
    'const qux = (a) => a + 1;', // 8
    'export interface Thing { x: number }', // 9
    'type Id = string;', // 10
  ].join('\n');

  it('finds classes, methods, functions, arrows, interfaces, types', () => {
    const got = extractSymbols('x.ts', src).map((s) => [s.name, s.kind, s.line]);
    expect(got).toEqual([
      ['Foo', 'class', 1],
      ['bar', 'method', 3],
      ['baz', 'function', 7],
      ['qux', 'function', 8],
      ['Thing', 'interface', 9],
      ['Id', 'type', 10],
    ]);
  });

  it('skips control-flow keywords masquerading as methods', () => {
    const got = extractSymbols('x.ts', 'function f(){\n  for (;;) {\n  }\n}');
    expect(got.map((s) => s.name)).toEqual(['f']);
  });
});

describe('extractSymbols (python)', () => {
  it('distinguishes top-level functions from methods', () => {
    const src = 'class A:\n    def m(self):\n        pass\ndef top():\n    pass';
    expect(extractSymbols('a.py', src).map((s) => [s.name, s.kind])).toEqual([
      ['A', 'class'],
      ['m', 'method'],
      ['top', 'function'],
    ]);
  });
});

describe('extractSymbols (markdown / css)', () => {
  it('lists markdown headings', () => {
    expect(extractSymbols('r.md', '# Title\nintro\n## Sub').map((s) => s.name)).toEqual([
      'Title',
      'Sub',
    ]);
  });
  it('lists css rules but not at-rules', () => {
    const css = '.card {\n  color: red;\n}\n@media (x) {\n.deep {\n}\n}';
    expect(extractSymbols('s.css', css).map((s) => s.name)).toEqual(['.card', '.deep']);
  });
});

describe('filterSymbols', () => {
  const syms = extractSymbols('x.ts', 'function fooBar(){}\nfunction baz(){}');
  it('keeps subsequence matches, case-insensitive', () => {
    expect(filterSymbols(syms, 'fb').map((s) => s.name)).toEqual(['fooBar']);
  });
  it('returns all for an empty query', () => {
    expect(filterSymbols(syms, '  ')).toHaveLength(2);
  });
});
