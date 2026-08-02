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

// Everything that touches the WORKING TREE or the INDEX shells out to the system
// git, not isomorphic-git. isomorphic-git does not implement `core.autocrlf`
// (true by default on Git for Windows), so it compares CRLF working-tree bytes
// against LF blobs and reports every text file as modified: the Source Control
// list filled with phantom changes, every branch switch failed with
// CheckoutConflictError even on a clean tree, and `add`/`commit` would have
// written CRLF blobs into history. System git handles autocrlf, .gitattributes,
// and filters correctly — this is also what VS Code does.
async function run(cwd: string, args: string[], timeout = 120_000): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

// The enclosing repo root (works from any subdirectory), with forward slashes.
async function repoRoot(dir: string): Promise<string> {
  const out = await run(dir, ['rev-parse', '--show-toplevel'], 20_000);
  return out.trim().replace(/\\/g, '/');
}

// Map a porcelain status letter to our simplified file status.
function letterToStatus(letter: string): GitFileChange['status'] {
  if (letter === 'A' || letter === '?' || letter === 'C') return 'added';
  if (letter === 'D') return 'deleted';
  return 'modified'; // M, R, T, U
}

// Parse `git status --porcelain=v1 -z`. Records are NUL-terminated; a rename or
// copy (R/C) is followed by an extra NUL-terminated original path.
export function parsePorcelain(out: string): GitFileChange[] {
  const parts = out.split('\0');
  const files: GitFileChange[] = [];
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    if (rec.length < 4) continue; // '' or a trailing fragment
    const x = rec[0]; // index (staged) status
    const y = rec[1]; // working-tree (unstaged) status
    const filepath = rec.slice(3);
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') i++; // skip the original path
    if (x === '?' && y === '?') {
      files.push({ path: filepath, status: 'added', staged: false });
      continue;
    }
    // A file can be staged AND have further unstaged edits (e.g. "MM") — emit
    // both so it shows in each section, like git itself reports it.
    if (x !== ' ' && x !== '?') files.push({ path: filepath, status: letterToStatus(x), staged: true });
    if (y !== ' ' && y !== '?') files.push({ path: filepath, status: letterToStatus(y), staged: false });
  }
  return files;
}

export async function getGitStatus(dir: string): Promise<GitStatus> {
  try {
    const root = await repoRoot(dir);
    // A repo with no commits yet has no resolvable HEAD — that's not an error.
    let branch: string | null = null;
    try {
      const name = (await run(root, ['rev-parse', '--abbrev-ref', 'HEAD'], 20_000)).trim();
      branch = name && name !== 'HEAD' ? name : null;
    } catch {
      branch = (await run(root, ['symbolic-ref', '--short', '-q', 'HEAD'], 20_000)).trim() || null;
    }
    const out = await run(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 60_000);
    return { isRepo: true, branch, files: parsePorcelain(out), root };
  } catch {
    // Not a git repository (or git is unavailable).
    return { isRepo: false, branch: null, files: [] };
  }
}

// Stage a single path. `git add -A` covers adds, edits, and deletions.
export async function stageFile(rootPath: string, filepath: string): Promise<void> {
  const dir = await repoRoot(rootPath);
  await run(dir, ['add', '-A', '--', filepath]);
}

export async function unstageFile(rootPath: string, filepath: string): Promise<void> {
  const dir = await repoRoot(rootPath);
  try {
    await run(dir, ['reset', '-q', 'HEAD', '--', filepath]);
  } catch {
    // No HEAD yet (repo without commits) — drop it from the index instead.
    await run(dir, ['rm', '--cached', '-q', '--', filepath]);
  }
}

// Stage every change in the working tree.
export async function stageAll(rootPath: string): Promise<void> {
  const dir = await repoRoot(rootPath);
  await run(dir, ['add', '-A']);
}

// Identity args so a commit still works when user.name/email aren't configured
// (matching the previous isomorphic-git fallback) without writing any config.
async function identityArgs(dir: string): Promise<string[]> {
  const has = async (key: string) => {
    try {
      return (await run(dir, ['config', '--get', key], 15_000)).trim().length > 0;
    } catch {
      return false;
    }
  };
  const args: string[] = [];
  if (!(await has('user.name'))) args.push('-c', 'user.name=Strix User');
  if (!(await has('user.email'))) args.push('-c', 'user.email=strix@local');
  return args;
}

// Commit the staged changes; returns the new commit's full SHA.
export async function commit(rootPath: string, message: string): Promise<string> {
  const dir = await repoRoot(rootPath);
  const ident = await identityArgs(dir);
  await run(dir, [...ident, 'commit', '-m', message]);
  return (await run(dir, ['rev-parse', 'HEAD'], 20_000)).trim();
}

// The unified diff of the staged changes (`git diff --cached`). Used to draft an
// AI commit message. Shells out to git (fast, exact) within the repo root.
export async function getStagedDiff(rootPath: string): Promise<string> {
  const dir = await repoRoot(rootPath);
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
  const dir = await repoRoot(rootPath);
  const { branch } = await getGitStatus(dir);
  if (!branch) {
    return { url: null, pushed: false, branch: null, error: 'Detached HEAD — checkout a branch first.' };
  }

  let remote = '';
  try {
    remote = (await run(dir, ['config', '--get', 'remote.origin.url'], 15_000)).trim();
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
  const dir = await repoRoot(rootPath);
  const out = await run(dir, ['branch', '--format=%(refname:short)'], 30_000);
  const branches = out.split('\n').map((s) => s.trim()).filter(Boolean);
  const { branch } = await getGitStatus(dir);
  return { current: branch, branches };
}

// Switch to an existing branch. Carries uncommitted changes across when they
// don't collide; git refuses (and we surface a stash prompt) when they would be
// overwritten — exactly the CLI's behaviour.
export async function checkoutBranch(rootPath: string, ref: string): Promise<void> {
  const dir = await repoRoot(rootPath);
  await run(dir, ['checkout', ref]);
}

// Create a new branch off HEAD and switch to it.
export async function createBranch(rootPath: string, name: string): Promise<void> {
  const dir = await repoRoot(rootPath);
  await run(dir, ['checkout', '-b', name]);
}

// Recent commit history (first line of each message).
export async function gitLog(rootPath: string, depth = 50): Promise<GitLogEntry[]> {
  const dir = await repoRoot(rootPath);
  try {
    const out = await run(dir, [
      'log',
      `-n${depth}`,
      '--format=%h%x1f%s%x1f%an%x1f%ct',
    ]);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [oid, message, author, ct] = line.split('\x1f');
        return { oid, message: message ?? '', author: author ?? '', date: Number(ct) * 1000 };
      });
  } catch {
    return []; // no commits yet
  }
}

// Pull / push via the system git so the user's existing credentials/helper are
// used (no token storage needed). Returns combined output on failure.
export async function pull(rootPath: string): Promise<{ ok: boolean; output: string }> {
  const dir = await repoRoot(rootPath);
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

// Turn the noisiest git push failures into one-line human guidance.
function friendlyPushError(msg: string): string {
  if (/src refspec .* does not match any|does not match any/i.test(msg)) {
    return 'Nothing to push yet — make a commit first (enter a message and click Commit).';
  }
  if (/no configured push destination|does not appear to be a git repository|no such remote/i.test(msg)) {
    return 'No GitHub remote set for this folder. Add one with: git remote add origin <url>.';
  }
  if (/authentication failed|could not read Username|terminal prompts disabled|403/i.test(msg)) {
    return 'GitHub authentication failed. Sign in (Clone → Sign in with GitHub) or check your credentials.';
  }
  if (/\[rejected\]|non-fast-forward|fetch first/i.test(msg)) {
    return 'Remote has newer commits — Pull (or Sync) first, then push.';
  }
  return msg;
}

export async function push(rootPath: string): Promise<{ ok: boolean; output: string }> {
  const dir = await repoRoot(rootPath);
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
        return { ok: false, output: friendlyPushError(e2 instanceof Error ? e2.message : String(e2)) };
      }
    }
    return { ok: false, output: friendlyPushError(msg) };
  }
}

// Sync = pull then push (VS Code's circular-arrows action). A pull failure when
// there's no upstream yet is expected and benign — we only surface it if it's a
// real problem; otherwise the push result is what matters.
export async function sync(rootPath: string): Promise<{ ok: boolean; output: string }> {
  const pulled = await pull(rootPath);
  const pushed = await push(rootPath);
  const parts: string[] = [];
  if (pulled.ok && pulled.output && pulled.output !== 'Up to date.') parts.push(pulled.output);
  parts.push(pushed.output);
  return { ok: pushed.ok, output: parts.join('\n') || (pushed.ok ? 'Synced.' : 'Sync failed.') };
}

// --- Stash (shelve uncommitted work so you can switch branches) ---------------
// We shell out to the system git: its stash is battle-tested and handles the
// index/working-tree/untracked interplay that isomorphic-git can't yet.

export interface GitStashEntry {
  ref: string; // e.g. "stash@{0}"
  message: string; // e.g. "WIP on main: 1a2b3c4 Some commit"
  date: number; // ms since epoch
}

// All stashes, newest first. Empty on a repo with no stashes (or any error).
export async function stashList(rootPath: string): Promise<GitStashEntry[]> {
  const dir = await repoRoot(rootPath);
  try {
    // \x1f (unit separator) is safe: it never appears in refs/messages.
    const { stdout } = await execFileAsync(
      'git',
      ['stash', 'list', '--format=%gd%x1f%s%x1f%ct'],
      { cwd: dir, maxBuffer: 4 * 1024 * 1024 },
    );
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [ref, message, ct] = line.split('\x1f');
        return { ref, message: message ?? '', date: Number(ct) * 1000 };
      });
  } catch {
    return [];
  }
}

// Shelve the current changes. `includeUntracked` also stashes new files (git's
// default leaves them behind, which won't block a checkout anyway).
export async function stashPush(
  rootPath: string,
  message?: string,
  includeUntracked = false,
): Promise<{ ok: boolean; output: string }> {
  const dir = await repoRoot(rootPath);
  const args = ['stash', 'push'];
  if (includeUntracked) args.push('-u');
  if (message && message.trim()) args.push('-m', message.trim());
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd: dir, timeout: 60_000 });
    const out = `${stdout}${stderr}`.trim();
    if (/No local changes to save/i.test(out)) return { ok: false, output: 'No local changes to stash.' };
    return { ok: true, output: out || 'Stashed.' };
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }
}

// pop = apply + drop; apply = keep the stash; drop = discard it. `ref` targets a
// specific entry (e.g. "stash@{2}"); omit to act on the most recent.
async function stashOp(
  rootPath: string,
  op: 'pop' | 'apply' | 'drop',
  ref?: string,
): Promise<{ ok: boolean; output: string }> {
  const dir = await repoRoot(rootPath);
  const args = ['stash', op];
  if (ref) args.push(ref);
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd: dir, timeout: 60_000 });
    return { ok: true, output: `${stdout}${stderr}`.trim() || `Stash ${op} done.` };
  } catch (e) {
    // A conflicting pop/apply exits non-zero but may have partially applied —
    // surface git's message so the user can resolve it.
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, output: msg };
  }
}

export const stashPop = (rootPath: string, ref?: string) => stashOp(rootPath, 'pop', ref);
export const stashApply = (rootPath: string, ref: string) => stashOp(rootPath, 'apply', ref);
export const stashDrop = (rootPath: string, ref: string) => stashOp(rootPath, 'drop', ref);

// The committed (HEAD) content of a file, for diffing against the working copy.
// Returns '' for untracked/new files or any error.
export async function getFileHeadContent(filePath: string): Promise<string> {
  try {
    const root = await repoRoot(path.dirname(filePath));
    const filepath = path.relative(root, filePath).replace(/\\/g, '/');
    // `git show` applies the same smudge filters as checkout (autocrlf), so the
    // text lines up with the editor buffer and the dirty-diff gutter is accurate.
    return await run(root, ['show', `HEAD:${filepath}`], 30_000);
  } catch {
    return '';
  }
}
