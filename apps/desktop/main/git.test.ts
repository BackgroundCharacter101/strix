import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import gitClient from 'isomorphic-git';
import { promises as fsp } from 'fs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getGitStatus } from './git';

let tmp: string;

beforeEach(async () => {
  tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'strix-git-'));
});

afterEach(async () => {
  await fsp.rm(tmp, { recursive: true, force: true });
});

describe('getGitStatus', () => {
  it('returns isRepo:false outside a git repository', async () => {
    // findRoot walks the real filesystem and could hit an ancestor repo, so
    // stub it to simulate "no enclosing repo" deterministically.
    vi.spyOn(gitClient, 'findRoot').mockRejectedValueOnce(new Error('no git root'));
    const status = await getGitStatus(tmp);
    expect(status.isRepo).toBe(false);
    expect(status.branch).toBeNull();
    expect(status.files).toEqual([]);
    vi.restoreAllMocks();
  });

  it('reports the branch and an untracked file', async () => {
    await gitClient.init({ fs, dir: tmp, defaultBranch: 'main' });
    await fsp.writeFile(path.join(tmp, 'a.txt'), 'hello', 'utf8');

    const status = await getGitStatus(tmp);
    expect(status.isRepo).toBe(true);
    expect(status.branch).toBe('main');
    expect(status.files).toContainEqual({ path: 'a.txt', status: 'added', staged: false });
  });

  it('finds the enclosing repo when called from a subdirectory', async () => {
    await gitClient.init({ fs, dir: tmp, defaultBranch: 'main' });
    const sub = path.join(tmp, 'pkg', 'src');
    await fsp.mkdir(sub, { recursive: true });
    await fsp.writeFile(path.join(sub, 'a.ts'), 'x', 'utf8');

    const status = await getGitStatus(sub);
    expect(status.isRepo).toBe(true);
    expect(status.branch).toBe('main');
    expect(status.files.some((f) => f.path === 'pkg/src/a.ts')).toBe(true);
  });

  it('marks a file as staged once it is added to the index', async () => {
    await gitClient.init({ fs, dir: tmp, defaultBranch: 'main' });
    await fsp.writeFile(path.join(tmp, 'a.txt'), 'hello', 'utf8');
    await gitClient.add({ fs, dir: tmp, filepath: 'a.txt' });

    const status = await getGitStatus(tmp);
    const file = status.files.find((f) => f.path === 'a.txt');
    expect(file).toEqual({ path: 'a.txt', status: 'added', staged: true });
  });
});
