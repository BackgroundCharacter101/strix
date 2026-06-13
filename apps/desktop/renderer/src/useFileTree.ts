import { useCallback, useEffect, useState } from 'react';
import type { FileNode } from '../../main/fs';

export interface FileTreeState {
  tree: FileNode | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// How often the Explorer re-reads the workspace from disk, so changes made
// OUTSIDE the IDE (e.g. a coding agent like FreeBuff creating/editing files)
// show up without a manual refresh.
const POLL_MS = 10_000;

export function useFileTree(rootPath: string): FileTreeState {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `silent` refreshes (the 10s poll) don't toggle loading/error, so the tree
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

  // Live refresh: poll every 10s while the window is visible (fallback), AND
  // refresh immediately when the workspace watcher reports a change.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) fetchTree(true);
    }, POLL_MS);
    const off = window.strix.fs.onChanged(() => fetchTree(true));
    return () => {
      clearInterval(id);
      off();
    };
  }, [fetchTree]);

  return { tree, loading, error, reload };
}
