import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import gitClient from 'isomorphic-git';
import { promises as fsp } from 'fs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  getGitStatus,
  listBranches,
  createBranch,
  checkoutBranch,
  gitLog,
  commit,
  stashList,
  stashPush,
  stashPop,
  parsePorcelain,
} from './git';

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

describe('branches + history', () => {
  async function repoWithCommit() {
    await gitClient.init({ fs, dir: tmp, defaultBranch: 'main' });
    await fsp.writeFile(path.join(tmp, 'a.txt'), 'hello', 'utf8');
    await gitClient.add({ fs, dir: tmp, filepath: 'a.txt' });
    await commit(tmp, 'initial commit');
  }

  it('lists branches and creates/switches', async () => {
    await repoWithCommit();
    let b = await listBranches(tmp);
    expect(b.current).toBe('main');
    expect(b.branches).toContain('main');

    await createBranch(tmp, 'feature/x');
    b = await listBranches(tmp);
    expect(b.current).toBe('feature/x');
    expect(b.branches).toEqual(expect.arrayContaining(['main', 'feature/x']));

    await checkoutBranch(tmp, 'main');
    expect((await listBranches(tmp)).current).toBe('main');
  });

  it('returns commit history (newest first)', async () => {
    await repoWithCommit();
    await fsp.writeFile(path.join(tmp, 'b.txt'), 'two', 'utf8');
    await gitClient.add({ fs, dir: tmp, filepath: 'b.txt' });
    await commit(tmp, 'second commit');

    const log = await gitLog(tmp, 10);
    expect(log.length).toBe(2);
    expect(log[0].message).toBe('second commit');
    expect(log[1].message).toBe('initial commit');
    expect(log[0].oid).toHaveLength(7);
  });
});

describe('autocrlf (Windows) — no phantom changes, switching works', () => {
  // Regression guard: isomorphic-git ignores core.autocrlf, so it saw every text
  // file as modified (CRLF working tree vs LF blob). That filled Source Control
  // with phantom changes and made every branch switch throw CheckoutConflictError
  // even on a clean tree. System git normalizes, so both must behave.
  it('reports a clean tree and switches branches with core.autocrlf=true', async () => {
    await gitClient.init({ fs, dir: tmp, defaultBranch: 'main' });
    const cfg = (k: string, v: string) => execFileSync('git', ['config', k, v], { cwd: tmp });
    cfg('user.email', 't@t');
    cfg('user.name', 'T');
    cfg('core.autocrlf', 'true');
    // LF in the file; with autocrlf git stores LF and checks out CRLF.
    await fsp.writeFile(path.join(tmp, 'a.txt'), 'line one\nline two\n', 'utf8');
    execFileSync('git', ['add', 'a.txt'], { cwd: tmp });
    await commit(tmp, 'initial');
    await createBranch(tmp, 'feature');
    await fsp.writeFile(path.join(tmp, 'a.txt'), 'line one\nchanged on feature\n', 'utf8');
    execFileSync('git', ['add', 'a.txt'], { cwd: tmp });
    await commit(tmp, 'feature edit');
    await checkoutBranch(tmp, 'main');
    // Force the CRLF working-tree form git would produce on checkout.
    await fsp.writeFile(path.join(tmp, 'a.txt'), 'line one\r\nline two\r\n', 'utf8');

    // No phantom modification, even though the bytes differ from the blob.
    expect((await getGitStatus(tmp)).files).toEqual([]);
    // ...and the branch switch succeeds instead of CheckoutConflictError.
    await checkoutBranch(tmp, 'feature');
    expect((await getGitStatus(tmp)).branch).toBe('feature');
  });
});

describe('parsePorcelain', () => {
  it('splits staged and unstaged, handles untracked and renames', () => {
    // "MM" = staged edit plus further unstaged edit → one row in each section.
    const out = 'MM a.ts\0A  new.ts\0 D gone.ts\0?? untracked.ts\0R  to.ts\0from.ts\0';
    expect(parsePorcelain(out)).toEqual([
      { path: 'a.ts', status: 'modified', staged: true },
      { path: 'a.ts', status: 'modified', staged: false },
      { path: 'new.ts', status: 'added', staged: true },
      { path: 'gone.ts', status: 'deleted', staged: false },
      { path: 'untracked.ts', status: 'added', staged: false },
      { path: 'to.ts', status: 'modified', staged: true },
    ]);
  });
});

describe('stash', () => {
  // `git stash` writes internal commits, so it needs an author identity.
  async function repoWithIdentity() {
    await gitClient.init({ fs, dir: tmp, defaultBranch: 'main' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: tmp });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: tmp });
    await fsp.writeFile(path.join(tmp, 'a.txt'), 'v1', 'utf8');
    await gitClient.add({ fs, dir: tmp, filepath: 'a.txt' });
    await commit(tmp, 'initial');
  }

  it('stashes a dirty change, lists it, and pop restores it', async () => {
    await repoWithIdentity();
    await fsp.writeFile(path.join(tmp, 'a.txt'), 'v2 dirty', 'utf8');

    const push = await stashPush(tmp, 'my wip');
    expect(push.ok).toBe(true);
    // Working tree is back to the committed content — the switch would now succeed.
    expect(await fsp.readFile(path.join(tmp, 'a.txt'), 'utf8')).toBe('v1');

    const list = await stashList(tmp);
    expect(list.length).toBe(1);
    expect(list[0].ref).toBe('stash@{0}');
    expect(list[0].message).toContain('my wip');

    const pop = await stashPop(tmp);
    expect(pop.ok).toBe(true);
    expect(await fsp.readFile(path.join(tmp, 'a.txt'), 'utf8')).toBe('v2 dirty');
    expect((await stashList(tmp)).length).toBe(0);
  });

  it('reports "no local changes" when there is nothing to stash', async () => {
    await repoWithIdentity();
    const res = await stashPush(tmp);
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/no local changes/i);
  });
});
