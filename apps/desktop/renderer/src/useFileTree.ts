import { useCallback, useEffect, useState } from 'react';
import type { FileNode } from '../../main/fs';

export interface FileTreeState {
  tree: FileNode | null;
  loading: boolean;
  error: string | null;
  // True when the project was too large and the tree was capped (partial list).
  truncated: boolean;
  reload: () => void;
}

// Debounce window for coalescing a burst of file-change events into one tree
// re-read (an agent / npm install can fire hundreds of events at once).
const REFRESH_DEBOUNCE_MS = 600;

export function useFileTree(rootPath: string): FileTreeState {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `silent` refreshes (watcher-driven) don't toggle loading/error, so the tree
  // updates in place — no "Loading…" flash and no error flicker on a transient
  // read — and the component-local expanded/selection state is preserved.
  const fetchTree = useCallback(
    (silent: boolean) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      window.strix.fs
        .tree(rootPath)
        .then(setTree)
        .catch((e: unknown) => {
          if (!silent) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [rootPath],
  );

  const reload = useCallback(() => fetchTree(false), [fetchTree]);

  // Initial (visible) load.
  useEffect(() => fetchTree(false), [fetchTree]);

  // Live refresh: re-read ONLY when the workspace watcher reports a change
  // (debounced). No interval poll — a periodic full-tree walk pegged the CPU on
  // big projects.
  useEffect(() => {
    let timer: number | null = null;
    const off = window.strix.fs.onChanged(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (!document.hidden) fetchTree(true);
      }, REFRESH_DEBOUNCE_MS);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      off();
    };
  }, [fetchTree]);

  const truncated = Boolean((tree as (FileNode & { truncated?: boolean }) | null)?.truncated);
  return { tree, loading, error, truncated, reload };
}
