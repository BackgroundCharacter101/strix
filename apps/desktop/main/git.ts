import git from 'isomorphic-git';
import * as fs from 'fs';
import * as path from 'path';

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
