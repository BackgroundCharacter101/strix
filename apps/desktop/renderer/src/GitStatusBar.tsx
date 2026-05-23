import React from 'react';
import { useGitStatus } from './useGitStatus';

export function GitStatusBar({ rootPath }: { rootPath: string | null }) {
  const status = useGitStatus(rootPath);

  if (!status) {
    return <span aria-label="git status">…</span>;
  }
  if (!status.isRepo) {
    return <span aria-label="git status">not a git repo</span>;
  }

  const changed = status.files.length;
  return (
    <span aria-label="git status">
      {status.branch ?? 'detached'} · {changed === 0 ? 'clean' : `${changed} changed`}
    </span>
  );
}
