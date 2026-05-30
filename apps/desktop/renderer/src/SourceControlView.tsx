import React, { useState } from 'react';
import { useGitStatusState } from './useGitStatus';
import { FileIcon } from './FileTree';
import { showToast } from './toast';

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
  onOpenDiff: (absPath: string, relPath: string) => void;
}) {
  const { status, reload } = useGitStatusState(rootPath);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (!status) return <p className="muted">Loading…</p>;
  if (!status.isRepo) return <p className="muted">Not a git repository.</p>;

  const staged = status.files.filter((f) => f.staged);
  const unstaged = status.files.filter((f) => !f.staged);

  const guard = async (fn: () => Promise<void>) => {
    if (!rootPath) return;
    setBusy(true);
    try {
      await fn();
      reload();
    } catch (e) {
      showToast(`Git: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000);
    } finally {
      setBusy(false);
    }
  };

  const stage = (p: string) => void guard(() => window.strix.git.stage(rootPath!, p));
  const unstage = (p: string) => void guard(() => window.strix.git.unstage(rootPath!, p));
  const stageAll = () => void guard(() => window.strix.git.stageAll(rootPath!));
  const commit = () =>
    void guard(async () => {
      await window.strix.git.commit(rootPath!, message.trim());
      setMessage('');
      showToast('Changes committed', 'success');
    });

  // File paths from git are relative to the REPO root, which may differ from the
  // opened workspace folder — resolve diffs against the repo root.
  const repoRoot = status.root ?? rootPath;

  const fileRow = (f: (typeof status.files)[number], action: 'stage' | 'unstage') => {
    const abs = repoRoot
      ? `${repoRoot}${sep(repoRoot)}${f.path.replace(/\//g, sep(repoRoot))}`
      : f.path;
    return (
      <li key={f.path} className="scm-line">
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
        <button
          type="button"
          className="scm-stage-btn"
          aria-label={action === 'stage' ? `Stage ${f.path}` : `Unstage ${f.path}`}
          title={action === 'stage' ? 'Stage' : 'Unstage'}
          disabled={busy}
          onClick={() => (action === 'stage' ? stage(f.path) : unstage(f.path))}
        >
          {action === 'stage' ? '+' : '−'}
        </button>
      </li>
    );
  };

  return (
    <div className="scm-view" aria-label="source control">
      <div className="scm-commit">
        <textarea
          className="scm-message"
          aria-label="Commit message"
          placeholder={`Message (commit on ${status.branch ?? 'HEAD'})`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button
          type="button"
          className="scm-commit-btn"
          disabled={busy || message.trim().length === 0 || staged.length === 0}
          onClick={commit}
        >
          Commit{staged.length ? ` (${staged.length})` : ''}
        </button>
      </div>

      {status.files.length === 0 && <p className="muted">No changes.</p>}

      {staged.length > 0 && (
        <>
          <div className="scm-group-head">
            <span>Staged Changes</span>
            <span className="scm-count">{staged.length}</span>
          </div>
          <ul className="scm-list">{staged.map((f) => fileRow(f, 'unstage'))}</ul>
        </>
      )}

      {unstaged.length > 0 && (
        <>
          <div className="scm-group-head">
            <span>Changes</span>
            <button type="button" className="scm-link" disabled={busy} onClick={stageAll}>
              Stage all
            </button>
          </div>
          <ul className="scm-list">{unstaged.map((f) => fileRow(f, 'stage'))}</ul>
        </>
      )}
    </div>
  );
}
