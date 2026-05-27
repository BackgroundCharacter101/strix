import { promises as fs } from 'fs';
import * as path from 'path';

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
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
