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

  // Keep the status fresh so the activity-bar badge clears after a commit and
  // reflects external git changes: poll lightly + refresh when the window
  // regains focus (e.g. after committing in a terminal).
  useEffect(() => {
    if (!rootPath) return;
    const id = window.setInterval(reload, 4000);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [rootPath, reload]);

  return { status, reload };
}

// Convenience wrapper for callers that only need the status value.
export function useGitStatus(rootPath: string | null): GitStatus | null {
  return useGitStatusState(rootPath).status;
}
