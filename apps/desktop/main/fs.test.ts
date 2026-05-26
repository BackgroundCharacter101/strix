import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildFileTree,
  readFileContents,
  writeFileContents,
  createEntry,
  renameEntry,
  removeEntry,
} from './fs';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'strix-fs-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('readFileContents / writeFileContents', () => {
  it('round-trips file content', async () => {
    const file = path.join(tmp, 'hello.txt');
    await writeFileContents(file, 'hi there');
    expect(await readFileContents(file)).toBe('hi there');
  });

  it('creates missing parent directories on write', async () => {
    const file = path.join(tmp, 'nested', 'deep', 'a.txt');
    await writeFileContents(file, 'x');
    expect(await readFileContents(file)).toBe('x');
  });
});

describe('createEntry / renameEntry / removeEntry', () => {
  it('creates an empty file (and its parent dirs)', async () => {
    const file = path.join(tmp, 'a', 'b', 'new.ts');
    await createEntry(file, 'file');
    expect(await readFileContents(file)).toBe('');
  });

  it('refuses to clobber an existing file', async () => {
    const file = path.join(tmp, 'keep.ts');
    await writeFileContents(file, 'precious');
    await expect(createEntry(file, 'file')).rejects.toThrow();
    expect(await readFileContents(file)).toBe('precious');
  });

  it('creates a directory', async () => {
    const dir = path.join(tmp, 'newdir');
    await createEntry(dir, 'directory');
    expect((await fs.stat(dir)).isDirectory()).toBe(true);
  });

  it('renames an entry', async () => {
    const from = path.join(tmp, 'old.ts');
    const to = path.join(tmp, 'renamed.ts');
    await writeFileContents(from, 'data');
    await renameEntry(from, to);
    expect(await readFileContents(to)).toBe('data');
    await expect(fs.stat(from)).rejects.toThrow();
  });

  it('removes files and directories recursively', async () => {
    const dir = path.join(tmp, 'gone');
    await writeFileContents(path.join(dir, 'inner.ts'), 'x');
    await removeEntry(dir);
    await expect(fs.stat(dir)).rejects.toThrow();
  });
});

describe('buildFileTree', () => {
  beforeEach(async () => {
    await writeFileContents(path.join(tmp, 'src', 'index.ts'), '');
    await writeFileContents(path.join(tmp, 'src', 'app.ts'), '');
    await writeFileContents(path.join(tmp, 'readme.md'), '');
    await fs.mkdir(path.join(tmp, 'node_modules', 'pkg'), { recursive: true });
  });

  it('returns a directory tree with directories sorted before files', async () => {
    const tree = await buildFileTree(tmp);
    expect(tree.type).toBe('directory');
    const names = tree.children!.map((c) => c.name);
    // node_modules is ignored; 'src' (dir) sorts before 'readme.md' (file).
    expect(names).toEqual(['src', 'readme.md']);
  });

  it('sorts files alphabetically within a directory', async () => {
    const tree = await buildFileTree(tmp);
    const src = tree.children!.find((c) => c.name === 'src')!;
    expect(src.children!.map((c) => c.name)).toEqual(['app.ts', 'index.ts']);
  });

  it('honors maxDepth by not expanding nested directories', async () => {
    const tree = await buildFileTree(tmp, { maxDepth: 0 });
    expect(tree.children).toEqual([]);
  });

  it('honors a custom ignore list', async () => {
    const tree = await buildFileTree(tmp, { ignore: ['src'] });
    expect(tree.children!.map((c) => c.name)).toEqual(['node_modules', 'readme.md']);
  });
});
