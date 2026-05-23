import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
    const status = await getGitStatus(tmp);
    expect(status.isRepo).toBe(false);
    expect(status.branch).toBeNull();
    expect(status.files).toEqual([]);
  });

  it('reports the branch and an untracked file', async () => {
    await gitClient.init({ fs, dir: tmp, defaultBranch: 'main' });
    await fsp.writeFile(path.join(tmp, 'a.txt'), 'hello', 'utf8');

    const status = await getGitStatus(tmp);
    expect(status.isRepo).toBe(true);
    expect(status.branch).toBe('main');
    expect(status.files).toContainEqual({ path: 'a.txt', status: 'added', staged: false });
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
