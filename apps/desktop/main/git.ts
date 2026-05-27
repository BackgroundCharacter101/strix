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

    return { isRepo: true, branch, files };
  } catch {
    // Not a git repository (or .git unreadable).
    return { isRepo: false, branch: null, files: [] };
  }
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
