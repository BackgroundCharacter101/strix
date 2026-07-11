// Pure line-diff for the editor's git "dirty diff" gutter — classify each line
// of the current buffer against the git HEAD version as added / modified, and
// mark where lines were deleted. Line numbers are 1-based in the CURRENT buffer.
//
// A small LCS over lines (VS Code's dirty-diff uses the same shape). Good enough
// for gutter marks; not a full word-level diff.
export type HunkType = 'add' | 'modify' | 'delete';

export interface DiffHunk {
  type: HunkType;
  /** 1-based first line (in the current buffer) the mark applies to. */
  start: number;
  /** 1-based last line; equals start for a single line and for delete markers. */
  end: number;
}

function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

/**
 * Diff `head` (old) vs `current` (new). Returns hunks over the CURRENT buffer:
 * - `add`    — a run of lines present in current but not head
 * - `modify` — a deleted run immediately followed by an added run (a change)
 * - `delete` — lines removed with no replacement; marked on the current line the
 *              deletion sits before (0 → line 1).
 */
export function computeLineHunks(head: string, current: string): DiffHunk[] {
  // Normalize line endings; drop a single trailing newline so an unchanged file
  // with/without a final newline doesn't report a phantom change.
  const split = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const a = head.length === 0 ? [] : split(head);
  const b = current.length === 0 ? [] : split(current);

  const dp = lcsMatrix(a, b);
  const hunks: DiffHunk[] = [];
  let i = 0;
  let j = 0; // index into b (0-based); current line = j+1

  const pushAdd = (start: number, end: number) => hunks.push({ type: 'add', start, end });

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    // Collect the diverging runs: deletions from a, additions in b.
    const delStart = i;
    const addStart = j;
    while (i < a.length && j < b.length && a[i] !== b[j] && dp[i + 1][j] >= dp[i][j + 1]) i++;
    while (i < a.length && j < b.length && a[i] !== b[j] && dp[i + 1][j] < dp[i][j + 1]) j++;
    const deleted = i - delStart;
    const added = j - addStart;
    if (added > 0 && deleted > 0) hunks.push({ type: 'modify', start: addStart + 1, end: j });
    else if (added > 0) pushAdd(addStart + 1, j);
    else if (deleted > 0) hunks.push({ type: 'delete', start: Math.max(1, j), end: Math.max(1, j) });
  }
  // Trailing additions (new lines at EOF).
  if (j < b.length) pushAdd(j + 1, b.length);
  // Trailing deletions (lines removed at EOF).
  if (i < a.length) hunks.push({ type: 'delete', start: Math.max(1, b.length), end: Math.max(1, b.length) });

  return hunks;
}
