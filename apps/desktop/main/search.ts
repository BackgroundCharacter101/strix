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

// Escape a literal string for use in a RegExp.
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Replace every case-insensitive occurrence of `query` with `replacement`.
// Returns the new text and how many occurrences were replaced (pure → tested).
export function replaceAllCaseInsensitive(
  text: string,
  query: string,
  replacement: string,
): { text: string; count: number } {
  if (!query) return { text, count: 0 };
  const re = new RegExp(escapeRegExp(query), 'gi');
  const count = (text.match(re) ?? []).length;
  return { text: count ? text.replace(re, () => replacement) : text, count };
}

const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.turbo']);
const MAX_RESULTS = 500;
const MAX_FILE_BYTES = 1_000_000;
// A NUL byte is a strong signal the file is binary, not text.
const NUL = String.fromCharCode(0);

// Plain (case-insensitive substring) search across the workspace. Skips ignored
// dirs, oversized files, and anything that looks binary.
export async function searchInFiles(root: string, query: string): Promise<SearchMatch[]> {
  const needle = query.trim().toLowerCase();
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
          if (lines[i].toLowerCase().includes(needle)) {
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

// Replace `query` with `replacement` (case-insensitive) across all text files in
// the workspace. Returns the changed file paths so the UI can react (the file
// watcher also fires, live-reloading open tabs). Same ignore/size/binary rules.
export async function replaceInFiles(
  root: string,
  query: string,
  replacement: string,
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
        const { text: updated, count } = replaceAllCaseInsensitive(text, query, replacement);
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
