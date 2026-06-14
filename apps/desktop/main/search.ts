import { promises as fs } from 'fs';
import * as path from 'path';

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

export interface ReplaceResult {
  files: number;
  occurrences: number;
  changed: string[];
}

export interface MatchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

// Escape a literal string for use in a RegExp.
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a RegExp for a LITERAL query honouring case/whole-word options.
export function buildSearchRegExp(query: string, opts: MatchOptions = {}, global = false): RegExp {
  const esc = escapeRegExp(query);
  const body = opts.wholeWord ? `\\b${esc}\\b` : esc;
  return new RegExp(body, `${global ? 'g' : ''}${opts.caseSensitive ? '' : 'i'}`);
}

// Whether a line matches the query under the given options (pure → tested).
export function lineMatches(line: string, query: string, opts: MatchOptions = {}): boolean {
  if (!query) return false;
  return buildSearchRegExp(query, opts).test(line);
}

// Replace every occurrence of `query` with `replacement` under the options.
// Returns the new text and how many occurrences were replaced (pure → tested).
export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  opts: MatchOptions = {},
): { text: string; count: number } {
  if (!query) return { text, count: 0 };
  const re = buildSearchRegExp(query, opts, true);
  const count = (text.match(re) ?? []).length;
  return { text: count ? text.replace(re, () => replacement) : text, count };
}

// Back-compat alias (case-insensitive, substring).
export function replaceAllCaseInsensitive(
  text: string,
  query: string,
  replacement: string,
): { text: string; count: number } {
  return replaceAll(text, query, replacement);
}

const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.turbo']);
const MAX_RESULTS = 500;
const MAX_FILE_BYTES = 1_000_000;
// A NUL byte is a strong signal the file is binary, not text.
const NUL = String.fromCharCode(0);

// Literal search across the workspace honouring case/whole-word options. Skips
// ignored dirs, oversized files, and anything that looks binary.
export async function searchInFiles(
  root: string,
  query: string,
  opts: MatchOptions = {},
): Promise<SearchMatch[]> {
  const needle = query.trim();
  if (!needle) return [];
  const results: SearchMatch[] = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= MAX_RESULTS) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) return;
      if (IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        let text: string;
        try {
          const stat = await fs.stat(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          text = await fs.readFile(full, 'utf8');
        } catch {
          continue;
        }
        if (text.includes(NUL)) continue;
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lineMatches(lines[i], needle, opts)) {
            results.push({ path: full, line: i + 1, text: lines[i].trim().slice(0, 200) });
            if (results.length >= MAX_RESULTS) return;
          }
        }
      }
    }
  }

  await walk(root);
  return results;
}

// Streaming variant: invokes `onMatches` with batches of results as the walk
// finds them (so the UI fills progressively on big repos) and aborts early when
// `isCancelled()` returns true (e.g. the query changed). Same ignore/size/binary
// rules + MAX_RESULTS cap as searchInFiles.
export async function searchInFilesStream(
  root: string,
  query: string,
  onMatches: (batch: SearchMatch[]) => void,
  opts: MatchOptions = {},
  isCancelled: () => boolean = () => false,
  batchSize = 25,
): Promise<void> {
  const needle = query.trim();
  if (!needle) return;
  let count = 0;
  let batch: SearchMatch[] = [];
  const flush = () => {
    if (batch.length) {
      onMatches(batch);
      batch = [];
    }
  };

  async function walk(dir: string): Promise<void> {
    if (isCancelled() || count >= MAX_RESULTS) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (isCancelled() || count >= MAX_RESULTS) return;
      if (IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        let text: string;
        try {
          const stat = await fs.stat(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          text = await fs.readFile(full, 'utf8');
        } catch {
          continue;
        }
        if (text.includes(NUL)) continue;
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lineMatches(lines[i], needle, opts)) {
            batch.push({ path: full, line: i + 1, text: lines[i].trim().slice(0, 200) });
            count += 1;
            if (batch.length >= batchSize) flush();
            if (count >= MAX_RESULTS) {
              flush();
              return;
            }
          }
        }
      }
    }
  }

  await walk(root);
  if (!isCancelled()) flush();
}

// Replace `query` with `replacement` across all text files in the workspace,
// honouring case/whole-word options. Returns the changed file paths so the UI
// can react (the file watcher also fires, live-reloading open tabs). Same
// ignore/size/binary rules.
export async function replaceInFiles(
  root: string,
  query: string,
  replacement: string,
  opts: MatchOptions = {},
): Promise<ReplaceResult> {
  if (!query.trim()) return { files: 0, occurrences: 0, changed: [] };
  const changed: string[] = [];
  let occurrences = 0;

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        let text: string;
        try {
          const stat = await fs.stat(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          text = await fs.readFile(full, 'utf8');
        } catch {
          continue;
        }
        if (text.includes(NUL)) continue;
        const { text: updated, count } = replaceAll(text, query, replacement, opts);
        if (count > 0 && updated !== text) {
          try {
            await fs.writeFile(full, updated, 'utf8');
            changed.push(full);
            occurrences += count;
          } catch {
            /* skip unwritable files */
          }
        }
      }
    }
  }

  await walk(root);
  return { files: changed.length, occurrences, changed };
}
