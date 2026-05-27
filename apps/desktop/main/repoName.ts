// Derives a folder name from a git URL (the last path segment, sans .git).
// Pure + electron-free so it can be unit-tested.
export function repoNameFromUrl(url: string): string {
  const cleaned = url
    .trim()
    .replace(/\.git$/i, '')
    .replace(/[/\\]+$/, '');
  const name = cleaned.split(/[/\\]/).pop();
  return name && name.length > 0 ? name : 'repo';
}
