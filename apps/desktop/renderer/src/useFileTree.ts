import { useCallback, useEffect, useState } from 'react';
import type { FileNode } from '../../main/fs';

export interface FileTreeState {
  tree: FileNode | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useFileTree(rootPath: string): FileTreeState {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    window.tabea.fs
      .tree(rootPath)
      .then(setTree)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [rootPath]);

  useEffect(reload, [reload]);

  return { tree, loading, error, reload };
}
