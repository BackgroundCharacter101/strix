import { watch, type FSWatcher } from 'node:fs';
import * as path from 'node:path';

// Watches the workspace for changes made OUTSIDE the editor (an AI agent like
// FreeBuff/Claude, a terminal command, another app) and reports the affected
// absolute paths (debounced) so the renderer can live-reload open files and the
// Explorer. Recursive watch is supported on Windows/macOS; on Linux it may throw
// (caught) and the renderer's periodic Explorer poll covers that case.

// One watcher per owner (window webContents id), so multiple Strix windows can
// each watch their own workspace without stealing each other's events.
interface WatchEntry {
  watcher: FSWatcher;
  timer: ReturnType<typeof setTimeout> | null;
  pending: Set<string>;
}
const entries = new Map<number, WatchEntry>();

// Noise we never care about (build output, VCS internals, deps, temp files).
// Matches the fs-tree ignore list so a big repo's generated dirs don't fire
// event storms (an npm install / cargo build can emit thousands of events).
const IGNORE =
  /(^|[\\/])(node_modules|\.git|dist|build|release|\.cache|\.parcel-cache|out|\.next|\.nuxt|\.svelte-kit|coverage|\.turbo|target|vendor|\.venv|venv|__pycache__|\.gradle|\.mvn|\.idea)([\\/]|$)/i;

export function shouldIgnore(rel: string): boolean {
  if (!rel) return true;
  if (IGNORE.test(rel)) return true;
  // Editor/OS scratch files.
  return /\.tmp$|~$|\.swp$|\.DS_Store$/i.test(rel);
}

export function startWatching(
  owner: number,
  root: string,
  onChange: (paths: string[]) => void,
): void {
  stopWatching(owner);
  if (!root) return;
  try {
    const entry: WatchEntry = { watcher: null as unknown as FSWatcher, timer: null, pending: new Set() };
    entry.watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const rel = filename.toString();
      if (shouldIgnore(rel)) return;
      entry.pending.add(path.join(root, rel));
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        const paths = [...entry.pending];
        entry.pending.clear();
        entry.timer = null;
        if (paths.length) onChange(paths);
      }, 250);
    });
    entries.set(owner, entry);
  } catch {
    /* recursive watch unsupported here — Explorer poll is the fallback */
  }
}

export function stopWatching(owner?: number): void {
  const stop = (e: WatchEntry) => {
    e.watcher.close();
    if (e.timer) clearTimeout(e.timer);
    e.pending.clear();
  };
  if (owner === undefined) {
    for (const e of entries.values()) stop(e);
    entries.clear();
    return;
  }
  const e = entries.get(owner);
  if (e) {
    stop(e);
    entries.delete(owner);
  }
}
