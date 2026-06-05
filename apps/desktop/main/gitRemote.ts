// Pure, electron-free helpers for turning a git remote into a GitHub
// pull-request "compare" URL. Kept separate so it's unit-testable without git.

// Normalize an https or ssh GitHub-style remote to https://host/owner/repo
// (drops a trailing .git). Returns null if it doesn't look like a remote URL.
export function normalizeRemoteUrl(remote: string): string | null {
  const s = remote.trim().replace(/\.git$/i, '');
  if (!s) return null;

  // scp-style ssh: git@github.com:owner/repo
  let m = /^[\w.-]+@([^:]+):(.+)$/.exec(s);
  if (m) return `https://${m[1]}/${m[2]}`;

  // ssh://git@github.com/owner/repo
  m = /^ssh:\/\/[^@]+@([^/]+)\/(.+)$/.exec(s);
  if (m) return `https://${m[1]}/${m[2]}`;

  // https://github.com/owner/repo (force https)
  if (/^https?:\/\//i.test(s)) return s.replace(/^http:/i, 'https:');

  return null;
}

// Build the GitHub "open a PR from this branch" URL.
export function prCompareUrl(remote: string, branch: string): string | null {
  const base = normalizeRemoteUrl(remote);
  if (!base || !branch) return null;
  return `${base}/compare/${encodeURIComponent(branch)}?expand=1`;
}
