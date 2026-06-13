// Pick the workspace files most relevant to a question, so the AI can answer
// whole-repo questions and edit across files with real context (beyond the file
// tree + the open file). Pure + budget-bounded so it's unit-testable and never
// blows the prompt size.

export interface RepoFile {
  path: string;
  content: string;
}
export interface RankedFile extends RepoFile {
  score: number;
}

// Split text into lowercase word tokens (identifiers, ≥2 chars).
export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? []);
}

// Relevance of a file to the query tokens: a path-name hit is weighted heavily;
// content hits count (capped per term so one huge file can't dominate).
export function scoreFile(queryTokens: string[], file: RepoFile): number {
  const pathLower = file.path.toLowerCase();
  const contentLower = file.content.toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    if (pathLower.includes(t)) score += 5;
    let idx = contentLower.indexOf(t);
    let hits = 0;
    while (idx !== -1 && hits < 20) {
      hits += 1;
      idx = contentLower.indexOf(t, idx + t.length);
    }
    score += hits;
  }
  return score;
}

// Rank files by relevance and return the top ones within file-count + byte
// budgets. Empty when the query has no usable tokens or nothing matches.
export function rankFiles(
  query: string,
  files: RepoFile[],
  opts: { maxFiles?: number; maxBytes?: number } = {},
): RankedFile[] {
  const maxFiles = opts.maxFiles ?? 6;
  const maxBytes = opts.maxBytes ?? 24_000;
  const q = [...new Set(tokenize(query))];
  if (q.length === 0) return [];

  const ranked = files
    .map((f) => ({ ...f, score: scoreFile(q, f) }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const out: RankedFile[] = [];
  let bytes = 0;
  for (const f of ranked) {
    if (out.length >= maxFiles || bytes >= maxBytes) break;
    out.push(f);
    bytes += f.content.length;
  }
  return out;
}

// Extract `@path` mentions from a message (tokens that look like a file path —
// they contain a slash or a dot). Backslashes are normalised to '/'.
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/@([A-Za-z0-9_./\\-]+)/g)) {
    const t = m[1].replace(/[.,;:)\]]+$/, '').replace(/\\/g, '/');
    if (t && (t.includes('/') || t.includes('.'))) out.add(t);
  }
  return [...out];
}

// Resolve `@path` mentions against the gathered files: exact path, path suffix,
// or basename match. Returns the matched files (unique, in mention order).
export function resolveMentions(mentions: string[], files: RepoFile[]): RepoFile[] {
  const out: RepoFile[] = [];
  for (const raw of mentions) {
    const m = raw.toLowerCase();
    const hit = files.find((f) => {
      const p = f.path.toLowerCase();
      return p === m || p.endsWith('/' + m) || p.split('/').pop() === m;
    });
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

// Format the ranked files as a fenced context block for the prompt.
export function formatRepoContext(files: RankedFile[]): string {
  if (files.length === 0) return '';
  return (
    'Relevant project files:\n' +
    files.map((f) => `File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')
  );
}
