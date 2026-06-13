import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { searchInFiles, replaceInFiles, replaceAllCaseInsensitive, escapeRegExp } from './search';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'strix-search-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function write(rel: string, content: string) {
  const full = path.join(tmp, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

describe('searchInFiles', () => {
  it('finds case-insensitive matches with line numbers', async () => {
    await write('a.ts', 'const Needle = 1;\nother\nneedle again');
    const results = await searchInFiles(tmp, 'needle');
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ line: 1, text: 'const Needle = 1;' });
    expect(results[1]).toMatchObject({ line: 3, text: 'needle again' });
  });

  it('skips ignored directories like node_modules', async () => {
    await write('src/a.ts', 'token here');
    await write('node_modules/pkg/b.ts', 'token here too');
    const results = await searchInFiles(tmp, 'token');
    expect(results).toHaveLength(1);
    expect(results[0].path).toContain('src');
  });

  it('returns nothing for an empty query', async () => {
    await write('a.ts', 'anything');
    expect(await searchInFiles(tmp, '   ')).toEqual([]);
  });
});

describe('escapeRegExp', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegExp('a.b*c(')).toBe('a\\.b\\*c\\(');
  });
});

describe('replaceAllCaseInsensitive', () => {
  it('replaces every case-insensitive occurrence', () => {
    const r = replaceAllCaseInsensitive('Foo foo FOO bar', 'foo', 'baz');
    expect(r.count).toBe(3);
    expect(r.text).toBe('baz baz baz bar');
  });
  it('treats the query literally (no regex injection)', () => {
    const r = replaceAllCaseInsensitive('a.b a.b axb', 'a.b', 'X');
    expect(r.count).toBe(2);
    expect(r.text).toBe('X X axb');
  });
  it('no-ops on empty query or no match', () => {
    expect(replaceAllCaseInsensitive('hello', '', 'x')).toEqual({ text: 'hello', count: 0 });
    expect(replaceAllCaseInsensitive('hello', 'zzz', 'q')).toEqual({ text: 'hello', count: 0 });
  });
});

describe('replaceInFiles', () => {
  it('rewrites matching files and skips ignored dirs', async () => {
    await write('src/a.ts', 'const color = "red"; // color');
    await write('src/b.md', 'The COLOR is bold');
    await write('node_modules/pkg/c.ts', 'color stays');
    const res = await replaceInFiles(tmp, 'color', 'hue');
    expect(res.files).toBe(2);
    expect(res.occurrences).toBe(3);
    expect(await fs.readFile(path.join(tmp, 'src/a.ts'), 'utf8')).toBe('const hue = "red"; // hue');
    expect(await fs.readFile(path.join(tmp, 'src/b.md'), 'utf8')).toBe('The hue is bold');
    // node_modules untouched
    expect(await fs.readFile(path.join(tmp, 'node_modules/pkg/c.ts'), 'utf8')).toBe('color stays');
  });

  it('no-ops on an empty query', async () => {
    await write('a.ts', 'x');
    expect(await replaceInFiles(tmp, '  ', 'y')).toEqual({ files: 0, occurrences: 0, changed: [] });
  });
});
