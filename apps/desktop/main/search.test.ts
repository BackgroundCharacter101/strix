import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { searchInFiles } from './search';

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
