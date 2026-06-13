// Logic for the `@file` typeahead in the AI composer. Pure + caret-driven so it
// is unit-testable and never touches the DOM: given the textarea value and the
// caret offset, decide whether the user is typing an `@mention`, rank candidate
// file paths, and compute the text/caret after accepting one.

import { extractMentions } from './repoContext';

export interface ActiveMention {
  // The text typed after '@' and before the caret (may be '').
  query: string;
  // [start, end) offsets of the '@…' token within the full text.
  start: number;
  end: number;
}

// Detect an in-progress `@mention` ending at the caret. The token starts at an
// '@' that is at the start of the text or preceded by whitespace, and contains
// only path-ish characters up to the caret. Returns null when not in a mention.
export function activeMention(text: string, caret: number): ActiveMention | null {
  const upto = text.slice(0, caret);
  // Walk back from the caret over path-ish chars to find the '@'.
  const m = /(^|\s)@([A-Za-z0-9_./\\-]*)$/.exec(upto);
  if (!m) return null;
  const query = m[2].replace(/\\/g, '/');
  const start = caret - query.length - 1; // include the '@'
  return { query, start, end: caret };
}

// Rank file paths against a (lowercased) query. Basename matches rank above
// path matches; prefix above substring; shorter paths break ties. An empty
// query returns the first `limit` paths unchanged (recent/tree order).
export function rankMentionCandidates(query: string, paths: string[], limit = 8): string[] {
  const q = query.toLowerCase();
  if (!q) return paths.slice(0, limit);

  const scored: { path: string; score: number }[] = [];
  for (const p of paths) {
    const lower = p.toLowerCase();
    const base = lower.split('/').pop() ?? lower;
    let score = 0;
    if (base === q) score = 100;
    else if (base.startsWith(q)) score = 80;
    else if (base.includes(q)) score = 60;
    else if (lower.startsWith(q)) score = 40;
    else if (lower.includes(q)) score = 20;
    if (score > 0) scored.push({ path: p, score });
  }
  scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path));
  return scored.slice(0, limit).map((s) => s.path);
}

// Accept a candidate: replace the active `@…` token with `@path ` (trailing
// space so the user keeps typing) and return the new text + caret offset.
export function applyMention(
  text: string,
  active: ActiveMention,
  chosen: string,
): { text: string; caret: number } {
  const insert = `@${chosen} `;
  const next = text.slice(0, active.start) + insert + text.slice(active.end);
  return { text: next, caret: active.start + insert.length };
}

export interface PinnedFile {
  // The raw `@mention` token as written in the text (sans '@').
  mention: string;
  // The workspace path it resolves to.
  path: string;
}

// Which `@mentions` in the text resolve to real workspace files (full path,
// path suffix, or basename match), in mention order and de-duped by path.
// Drives the pinned-context chips above the composer.
export function pinnedFiles(text: string, paths: string[]): PinnedFile[] {
  const out: PinnedFile[] = [];
  for (const raw of extractMentions(text)) {
    const m = raw.toLowerCase();
    const hit = paths.find((p) => {
      const lp = p.toLowerCase();
      return lp === m || lp.endsWith('/' + m) || lp.split('/').pop() === m;
    });
    if (hit && !out.some((f) => f.path === hit)) out.push({ mention: raw, path: hit });
  }
  return out;
}

// Remove the first `@mention` token from the text (plus one trailing space, if
// present). Used when the user removes a pinned chip.
export function removeMention(text: string, mention: string): string {
  const esc = mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match '@mention' only when followed by end/whitespace (not @auth.tsx for
  // @auth.ts); swallow a single trailing space so we don't leave a gap.
  const re = new RegExp('@' + esc + '(?=$|\\s)\\s?');
  return text.replace(re, '');
}
