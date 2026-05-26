import React from 'react';
import { useGitStatus } from './useGitStatus';
import { GitBranchIcon } from './icons';

export function GitStatusBar({ rootPath }: { rootPath: string | null }) {
  const status = useGitStatus(rootPath);

  if (!status) {
    return (
      <span className="statusbar-item" aria-label="git status">
        …
      </span>
    );
  }
  if (!status.isRepo) {
    return (
      <span className="statusbar-item" aria-label="git status">
        not a git repo
      </span>
    );
  }

  const changed = status.files.length;
  return (
    <span className="statusbar-item statusbar-git" aria-label="git status">
      <GitBranchIcon />
      {status.branch ?? 'detached'}
      {changed === 0 ? '' : ` ${changed} changed`}
    </span>
  );
}
