import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitStatus } from '../../main/git';

export interface GitStatusState {
  status: GitStatus | null;
  reload: () => void;
}

export function useGitStatusState(rootPath: string | null): GitStatusState {
  const [status, setStatus] = useState<GitStatus | null>(null);
  // `git.status` runs statusMatrix, which re-hashes the ENTIRE working tree —
  // seconds on a big repo. Guard against overlapping runs so a slow status can't
  // pile up behind the refresh cadence.
  const inFlight = useRef(false);

  const reload = useCallback(() => {
    if (!rootPath) {
      setStatus(null);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    window.strix.git
      .status(rootPath)
      .then(setStatus)
      .finally(() => {
        inFlight.current = false;
      });
  }, [rootPath]);

  useEffect(reload, [reload]);

  // Keep the status (and the activity-bar badge) fresh WITHOUT a blind fast poll:
  // statusMatrix hashes the whole tree, so the old `setInterval(reload, 4000)`
  // pegged CPU every 4s even while just editing with SCM closed. Instead refresh
  // on real signals — file changes (debounced), window focus, and becoming
  // visible again — plus a slow 30s safety net that is skipped while hidden.
  useEffect(() => {
    if (!rootPath) return;
    let debounce: number | undefined;
    const offChanged = window.strix.fs.onChanged(() => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(reload, 800);
    });
    const onFocus = () => reload();
    const onVisible = () => {
      if (!document.hidden) reload();
    };
    const id = window.setInterval(() => {
      if (!document.hidden) reload();
    }, 30000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(debounce);
      offChanged();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [rootPath, reload]);

  return { status, reload };
}

// Convenience wrapper for callers that only need the status value.
export function useGitStatus(rootPath: string | null): GitStatus | null {
  return useGitStatusState(rootPath).status;
}
