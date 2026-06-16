import { describe, it, expect } from 'vitest';
import { langOf, flattenForMap, parseArchitecture, type MapTreeNode } from './projectMap';

describe('langOf', () => {
  it('maps extensions to language keys', () => {
    expect(langOf('a.tsx')).toBe('ts');
    expect(langOf('a.py')).toBe('py');
    expect(langOf('a.unknownext')).toBe('file');
    expect(langOf('Makefile')).toBe('file');
  });
});

const tree: MapTreeNode[] = [
  {
    name: 'src',
    type: 'directory',
    path: '/src',
    children: [
      { name: 'b.ts', type: 'file', path: '/src/b.ts' },
      { name: 'a.ts', type: 'file', path: '/src/a.ts' },
    ],
  },
  { name: 'readme.md', type: 'file', path: '/readme.md' },
];

describe('flattenForMap', () => {
  it('lists directories before files, alphabetical, with depth', () => {
    const rows = flattenForMap(tree);
    expect(rows.map((r) => [r.name, r.depth])).toEqual([
      ['src', 0],
      ['a.ts', 1],
      ['b.ts', 1],
      ['readme.md', 0],
    ]);
    expect(rows[0].lang).toBe('dir');
    expect(rows[1].lang).toBe('ts');
  });

  it('honours the collapsed set', () => {
    const rows = flattenForMap(tree, new Set(['/src']));
    expect(rows.map((r) => r.name)).toEqual(['src', 'readme.md']);
  });
});

describe('parseArchitecture', () => {
  it('parses fenced JSON and drops edges referencing unknown modules', () => {
    const reply =
      'Here:\n```json\n{"summary":"x","modules":[{"id":"ui","label":"UI"},{"id":"main","label":"Main"}],"edges":[{"from":"ui","to":"main"},{"from":"ui","to":"ghost"}]}\n```';
    const a = parseArchitecture(reply);
    expect(a?.modules.map((m) => m.id)).toEqual(['ui', 'main']);
    expect(a?.edges).toEqual([{ from: 'ui', to: 'main' }]);
  });

  it('returns null when no modules', () => {
    expect(parseArchitecture('no json here')).toBeNull();
    expect(parseArchitecture('{"modules":[]}')).toBeNull();
  });
});
