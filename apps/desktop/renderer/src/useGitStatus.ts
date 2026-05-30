import { useCallback, useEffect, useState } from 'react';
import type { GitStatus } from '../../main/git';

export interface GitStatusState {
  status: GitStatus | null;
  reload: () => void;
}

export function useGitStatusState(rootPath: string | null): GitStatusState {
  const [status, setStatus] = useState<GitStatus | null>(null);

  const reload = useCallback(() => {
    if (!rootPath) {
      setStatus(null);
      return;
    }
    window.strix.git.status(rootPath).then(setStatus);
  }, [rootPath]);

  useEffect(reload, [reload]);

  return { status, reload };
}

// Convenience wrapper for callers that only need the status value.
export function useGitStatus(rootPath: string | null): GitStatus | null {
  return useGitStatusState(rootPath).status;
}
