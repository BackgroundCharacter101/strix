import React, { useState } from 'react';
import { complete, configureAi } from '@strix/ai-gateway';
import { useGitStatusState } from './useGitStatus';
import { FileIcon } from './FileTree';
import { showToast } from './toast';
import { SparkleIcon } from './icons';
import { COMMIT_MESSAGE_INSTRUCTION, cleanCommitMessage } from './commitMessage';

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i === -1 ? p : p.slice(i + 1);
}

const STATUS_LETTER: Record<string, string> = { modified: 'M', added: 'A', deleted: 'D' };
const sep = (p: string) => (p.includes('\\') ? '\\' : '/');

export function SourceControlView({
  rootPath,
  onOpenDiff,
  aiServerUrl,
}: {
  rootPath: string | null;
  onOpenDiff: (absPath: string, relPath: string) => void;
  // Shared FreeLLMAPI host (blank = local) — used to draft commit messages.
  aiServerUrl?: string;
}) {
  const { status, reload } = useGitStatusState(rootPath);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [prBusy, setPrBusy] = useState(false);

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

  // Draft a commit message from the staged diff via the AI.
  const generateMessage = async () => {
    if (!rootPath) return;
    setAiBusy(true);
    try {
      const diff = (await window.strix.git.diffStaged(rootPath)).slice(0, 12_000);
      if (!diff.trim()) {
        showToast('Stage some changes first to draft a message.', 'info');
        return;
      }
      configureAi(await window.strix.ai.config(aiServerUrl || undefined));
      const reply = await complete('chat', {
        filePath: '',
        fileContent: diff,
        userMessage: COMMIT_MESSAGE_INSTRUCTION,
      });
      const msg = cleanCommitMessage(reply);
      if (msg) setMessage(msg);
      else showToast('The AI did not return a message — try again.', 'info');
    } catch (e) {
      showToast(`AI: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000);
    } finally {
      setAiBusy(false);
    }
  };

  // Push the current branch and open a GitHub PR compare page.
  const createPr = async () => {
    if (!rootPath) return;
    setPrBusy(true);
    try {
      const res = await window.strix.git.createPr(rootPath);
      if (res.url) {
        showToast(
          res.pushed
            ? `Pushed ${res.branch} — opening pull request…`
            : `Opening pull request for ${res.branch}…`,
          'success',
        );
      }
      if (res.error) {
        showToast(`Create PR: ${res.error}`, res.url ? 'info' : 'error', 8000);
      }
    } catch (e) {
      showToast(`Create PR: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000);
    } finally {
      setPrBusy(false);
    }
  };

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
        <div className="scm-message-wrap">
          <textarea
            className="scm-message"
            aria-label="Commit message"
            placeholder={`Message (commit on ${status.branch ?? 'HEAD'})`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button
            type="button"
            className="scm-ai-btn"
            title="Draft a commit message from the staged changes (AI)"
            aria-label="Generate commit message with AI"
            disabled={aiBusy || staged.length === 0}
            onClick={() => void generateMessage()}
          >
            <SparkleIcon size={13} />
            {aiBusy ? 'Drafting…' : 'Generate'}
          </button>
        </div>
        <button
          type="button"
          className="scm-commit-btn"
          disabled={busy || message.trim().length === 0 || staged.length === 0}
          onClick={commit}
        >
          Commit{staged.length ? ` (${staged.length})` : ''}
        </button>
        <button
          type="button"
          className="scm-pr-btn"
          title="Push the current branch and open a pull request on GitHub"
          disabled={prBusy}
          onClick={() => void createPr()}
        >
          {prBusy ? 'Creating…' : 'Create Pull Request'}
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
