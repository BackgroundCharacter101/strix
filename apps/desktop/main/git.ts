import git from 'isomorphic-git';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { prCompareUrl } from './gitRemote.js';

const execFileAsync = promisify(execFile);

export interface GitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  staged: boolean;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  files: GitFileChange[];
  // Absolute path of the repo root. File paths in `files` are relative to it
  // (which may differ from the opened workspace folder).
  root?: string;
}

// statusMatrix rows are [filepath, HEAD, WORKDIR, STAGE].
// HEAD/WORKDIR/STAGE === 1 across the board means unchanged.
export async function getGitStatus(dir: string): Promise<GitStatus> {
  try {
    // Walk up to the enclosing repo so status works from any subdirectory.
    const root = await git.findRoot({ fs, filepath: dir });
    const branch = (await git.currentBranch({ fs, dir: root, fullname: false })) ?? null;
    const matrix = await git.statusMatrix({ fs, dir: root });

    const files: GitFileChange[] = [];
    for (const [path, head, workdir, stage] of matrix) {
      if (head === 1 && workdir === 1 && stage === 1) {
        continue;
      }
      const status: GitFileChange['status'] =
        head === 0 ? 'added' : workdir === 0 ? 'deleted' : 'modified';
      files.push({ path, status, staged: stage !== head });
    }

    return { isRepo: true, branch, files, root };
  } catch {
    // Not a git repository (or .git unreadable).
    return { isRepo: false, branch: null, files: [] };
  }
}

// Stage a single path (add, or remove if it was deleted on disk).
export async function stageFile(rootPath: string, filepath: string): Promise<void> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  const abs = path.join(dir, filepath);
  if (fs.existsSync(abs)) await git.add({ fs, dir, filepath });
  else await git.remove({ fs, dir, filepath });
}

export async function unstageFile(rootPath: string, filepath: string): Promise<void> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  await git.resetIndex({ fs, dir, filepath });
}

// Stage every change in the working tree.
export async function stageAll(rootPath: string): Promise<void> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  const matrix = await git.statusMatrix({ fs, dir });
  for (const [filepath, head, workdir] of matrix) {
    if (head === 1 && workdir === 1) continue; // unchanged
    if (workdir === 0) await git.remove({ fs, dir, filepath });
    else await git.add({ fs, dir, filepath });
  }
}

// Commit the staged changes. Uses the repo's configured author, falling back to
// a generic Strix identity if git user.name/email aren't set.
export async function commit(rootPath: string, message: string): Promise<string> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  const name = (await git.getConfig({ fs, dir, path: 'user.name' })) || 'Strix User';
  const email = (await git.getConfig({ fs, dir, path: 'user.email' })) || 'strix@local';
  return git.commit({ fs, dir, message, author: { name, email } });
}

// The unified diff of the staged changes (`git diff --cached`). Used to draft an
// AI commit message. Shells out to git (fast, exact) within the repo root.
export async function getStagedDiff(rootPath: string): Promise<string> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  const { stdout } = await execFileAsync('git', ['diff', '--cached', '--no-color'], {
    cwd: dir,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export interface CreatePrResult {
  url: string | null;
  pushed: boolean;
  branch: string | null;
  error?: string;
}

// Push the current branch to origin and produce a GitHub "compare" URL to open a
// pull request. Pushing may fail (no remote/auth) — we still return the URL so
// the user can finish in the browser, with the error surfaced.
export async function createPullRequest(rootPath: string): Promise<CreatePrResult> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  const branch = (await git.currentBranch({ fs, dir, fullname: false })) ?? null;
  if (!branch) {
    return { url: null, pushed: false, branch: null, error: 'Detached HEAD — checkout a branch first.' };
  }

  let remote = '';
  try {
    remote = (await git.getConfig({ fs, dir, path: 'remote.origin.url' })) ?? '';
  } catch {
    /* no origin configured */
  }

  let pushed = false;
  let error: string | undefined;
  try {
    await execFileAsync('git', ['push', '-u', 'origin', branch], { cwd: dir, timeout: 90_000 });
    pushed = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const url = prCompareUrl(remote, branch);
  if (!url && !error) error = 'No GitHub origin remote found.';
  return { url, pushed, branch, error };
}

export interface GitBranches {
  current: string | null;
  branches: string[];
}

export interface GitLogEntry {
  oid: string;
  message: string;
  author: string;
  date: number;
}

// Local branches + the current one.
export async function listBranches(rootPath: string): Promise<GitBranches> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  const branches = await git.listBranches({ fs, dir });
  const current = (await git.currentBranch({ fs, dir, fullname: false })) ?? null;
  return { current, branches };
}

// Switch to an existing branch.
export async function checkoutBranch(rootPath: string, ref: string): Promise<void> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  await git.checkout({ fs, dir, ref });
}

// Create a new branch off HEAD and switch to it.
export async function createBranch(rootPath: string, name: string): Promise<void> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  await git.branch({ fs, dir, ref: name, checkout: true });
}

// Recent commit history (first line of each message).
export async function gitLog(rootPath: string, depth = 50): Promise<GitLogEntry[]> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  const commits = await git.log({ fs, dir, depth });
  return commits.map((c) => ({
    oid: c.oid.slice(0, 7),
    message: c.commit.message.split('\n')[0],
    author: c.commit.author.name,
    date: c.commit.author.timestamp * 1000,
  }));
}

// Pull / push via the system git so the user's existing credentials/helper are
// used (no token storage needed). Returns combined output on failure.
export async function pull(rootPath: string): Promise<{ ok: boolean; output: string }> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  try {
    const { stdout, stderr } = await execFileAsync('git', ['pull', '--ff-only'], {
      cwd: dir,
      timeout: 120_000,
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() || 'Up to date.' };
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }
}

export async function push(rootPath: string): Promise<{ ok: boolean; output: string }> {
  const dir = await git.findRoot({ fs, filepath: rootPath });
  try {
    const { stdout, stderr } = await execFileAsync('git', ['push'], { cwd: dir, timeout: 120_000 });
    return { ok: true, output: `${stdout}${stderr}`.trim() || 'Pushed.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // No upstream yet → publish the branch (set upstream) like VS Code does.
    if (/no upstream|set-upstream|has no upstream branch/i.test(msg)) {
      try {
        const { stdout, stderr } = await execFileAsync('git', ['push', '-u', 'origin', 'HEAD'], {
          cwd: dir,
          timeout: 120_000,
        });
        return { ok: true, output: `${stdout}${stderr}`.trim() || 'Published branch.' };
      } catch (e2) {
        return { ok: false, output: e2 instanceof Error ? e2.message : String(e2) };
      }
    }
    return { ok: false, output: msg };
  }
}

// Sync = pull then push (VS Code's circular-arrows action). A pull failure when
// there's no upstream yet is fine — push then publishes the branch.
export async function sync(rootPath: string): Promise<{ ok: boolean; output: string }> {
  const pulled = await pull(rootPath);
  const pushed = await push(rootPath);
  const output = [pulled.output, pushed.output].filter(Boolean).join('\n');
  return { ok: pushed.ok, output };
}

// The committed (HEAD) content of a file, for diffing against the working copy.
// Returns '' for untracked/new files or any error.
export async function getFileHeadContent(filePath: string): Promise<string> {
  try {
    const root = await git.findRoot({ fs, filepath: path.dirname(filePath) });
    const filepath = path.relative(root, filePath).replace(/\\/g, '/');
    const oid = await git.resolveRef({ fs, dir: root, ref: 'HEAD' });
    const { blob } = await git.readBlob({ fs, dir: root, oid, filepath });
    return new TextDecoder().decode(blob);
  } catch {
    return '';
  }
}
