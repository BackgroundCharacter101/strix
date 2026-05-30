import React from 'react';
import type { GitStatus } from '../../main/git';
import { GitBranchIcon } from './icons';

// Presentational git indicator for the status bar. The status is owned by App
// (so the activity-bar badge can share it). Clickable → opens Source Control.
export function GitStatusBar({
  status,
  onClick,
}: {
  status: GitStatus | null;
  onClick?: () => void;
}) {
  let body: React.ReactNode;
  if (!status) {
    body = '…';
  } else if (!status.isRepo) {
    body = 'not a git repo';
  } else {
    const changed = status.files.length;
    body = (
      <>
        <GitBranchIcon />
        {status.branch ?? 'detached'}
        {changed === 0 ? '' : ` ${changed} changed`}
      </>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className="statusbar-item statusbar-git statusbar-btn"
        aria-label="git status"
        title="Source Control"
        onClick={onClick}
      >
        {body}
      </button>
    );
  }
  return (
    <span className="statusbar-item statusbar-git" aria-label="git status">
      {body}
    </span>
  );
}
