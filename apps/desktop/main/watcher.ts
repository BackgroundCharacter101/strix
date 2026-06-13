import { watch, type FSWatcher } from 'node:fs';
import * as path from 'node:path';

// Watches the workspace for changes made OUTSIDE the editor (an AI agent like
// FreeBuff/Claude, a terminal command, another app) and reports the affected
// absolute paths (debounced) so the renderer can live-reload open files and the
// Explorer. Recursive watch is supported on Windows/macOS; on Linux it may throw
// (caught) and the renderer's periodic Explorer poll covers that case.

let watcher: FSWatcher | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const pending = new Set<string>();

// Noise we never care about (build output, VCS internals, deps, temp files).
const IGNORE = /(^|[\\/])(node_modules|\.git|dist|release|\.cache|out|\.next|coverage)([\\/]|$)/i;

export function shouldIgnore(rel: string): boolean {
  if (!rel) return true;
  if (IGNORE.test(rel)) return true;
  // Editor/OS scratch files.
  return /\.tmp$|~$|\.swp$|\.DS_Store$/i.test(rel);
}

export function startWatching(root: string, onChange: (paths: string[]) => void): void {
  stopWatching();
  if (!root) return;
  try {
    watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const rel = filename.toString();
      if (shouldIgnore(rel)) return;
      pending.add(path.join(root, rel));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const paths = [...pending];
        pending.clear();
        timer = null;
        if (paths.length) onChange(paths);
      }, 250);
    });
  } catch {
    /* recursive watch unsupported here — Explorer poll is the fallback */
  }
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending.clear();
}
