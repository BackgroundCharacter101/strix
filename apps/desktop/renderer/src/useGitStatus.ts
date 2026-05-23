import { useEffect, useState } from 'react';
import type { GitStatus } from '../../main/git';

export function useGitStatus(rootPath: string | null): GitStatus | null {
  const [status, setStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    if (!rootPath) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    window.strix.git.status(rootPath).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  return status;
}
