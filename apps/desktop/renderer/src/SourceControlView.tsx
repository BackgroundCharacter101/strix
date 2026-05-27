import React from 'react';
import { useGitStatus } from './useGitStatus';
import { FileIcon } from './FileTree';

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i === -1 ? p : p.slice(i + 1);
}

const STATUS_LETTER: Record<string, string> = { modified: 'M', added: 'A', deleted: 'D' };

const sep = (p: string) => (p.includes('\\') ? '\\' : '/');

export function SourceControlView({
  rootPath,
  onOpenDiff,
}: {
  rootPath: string | null;
  // relPath is repo-relative; absPath resolves against the workspace root.
  onOpenDiff: (absPath: string, relPath: string) => void;
}) {
  const status = useGitStatus(rootPath);

  if (!status) return <p className="muted">Loading…</p>;
  if (!status.isRepo) return <p className="muted">Not a git repository.</p>;
  if (status.files.length === 0) return <p className="muted">No changes.</p>;

  return (
    <div className="scm-view" aria-label="source control">
      <div className="scm-summary">
        {status.files.length} change{status.files.length === 1 ? '' : 's'} · {status.branch}
      </div>
      <ul className="scm-list">
        {status.files.map((f) => {
          const abs = rootPath ? `${rootPath}${sep(rootPath)}${f.path.replace(/\//g, sep(rootPath))}` : f.path;
          return (
            <li key={f.path}>
              <button
                type="button"
                className="scm-row"
                title={f.path}
                onClick={() => onOpenDiff(abs, f.path)}
              >
                <FileIcon name={f.path} />
                <span className="scm-name">{basename(f.path)}</span>
                <span className={`scm-status scm-${f.status}`}>{STATUS_LETTER[f.status]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
