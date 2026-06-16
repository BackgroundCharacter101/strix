import React, { useCallback, useEffect, useState } from 'react';
import { complete, configureAi } from '@strix/ai-gateway';
import type { GitBranches, GitLogEntry } from '../../main/git';
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
  const [branches, setBranches] = useState<GitBranches | null>(null);
  const [history, setHistory] = useState<GitLogEntry[]>([]);
  const [newBranch, setNewBranch] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const repoBranch = status?.branch ?? null;
  const reloadGit = useCallback(() => {
    if (!rootPath || !status?.isRepo) {
      setBranches(null);
      setHistory([]);
      return;
    }
    window.strix.git.listBranches(rootPath).then(setBranches).catch(() => {});
    window.strix.git.log(rootPath, 30).then(setHistory).catch(() => {});
  }, [rootPath, status?.isRepo, repoBranch]);
  useEffect(() => reloadGit(), [reloadGit]);

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

  const switchBranch = (ref: string) =>
    void guard(async () => {
      await window.strix.git.checkout(rootPath!, ref);
      showToast(`Switched to ${ref}`, 'success', 2500);
    });

  const makeBranch = () => {
    const name = newBranch.trim();
    if (!name) return;
    void guard(async () => {
      await window.strix.git.createBranch(rootPath!, name);
      setNewBranch('');
      showToast(`Created and switched to ${name}`, 'success', 2500);
    });
  };

  const sync = (dir: 'pull' | 'push' | 'sync') => {
    if (!rootPath || syncBusy) return;
    setSyncBusy(true);
    void (async () => {
      try {
        const api = window.strix.git;
        const res = await (dir === 'pull'
          ? api.pull(rootPath)
          : dir === 'push'
            ? api.push(rootPath)
            : api.sync(rootPath));
        const label = dir === 'pull' ? 'Pull' : dir === 'push' ? 'Push' : 'Sync';
        showToast(`${label}: ${res.output}`, res.ok ? 'success' : 'error', res.ok ? 3500 : 9000);
        reload();
        reloadGit();
      } finally {
        setSyncBusy(false);
      }
    })();
  };

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
      <div className="scm-branchbar">
        <select
          className="scm-branch-select"
          aria-label="Current branch"
          title="Switch branch"
          value={status.branch ?? ''}
          disabled={busy}
          onChange={(e) => e.target.value && switchBranch(e.target.value)}
        >
          {status.branch == null && <option value="">(detached HEAD)</option>}
          {(branches?.branches ?? (status.branch ? [status.branch] : [])).map((b) => (
            <option key={b} value={b}>
              ⎇ {b}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="scm-sync-btn"
          title="Pull (fast-forward) from origin"
          disabled={syncBusy}
          onClick={() => sync('pull')}
        >
          ↓ Pull
        </button>
        <button
          type="button"
          className="scm-sync-btn"
          title="Push to origin"
          disabled={syncBusy}
          onClick={() => sync('push')}
        >
          ↑ Push
        </button>
        <button
          type="button"
          className="scm-sync-btn scm-sync-primary"
          title="Sync — pull then push (publishes the branch if it has no upstream)"
          disabled={syncBusy}
          onClick={() => sync('sync')}
        >
          {syncBusy ? '…' : '⟲ Sync'}
        </button>
      </div>
      <div className="scm-newbranch">
        <input
          className="scm-newbranch-input"
          aria-label="New branch name"
          placeholder="New branch…"
          value={newBranch}
          onChange={(e) => setNewBranch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && makeBranch()}
        />
        <button
          type="button"
          className="scm-link"
          disabled={busy || newBranch.trim().length === 0}
          onClick={makeBranch}
        >
          Create
        </button>
      </div>

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

      {history.length > 0 && (
        <>
          <button
            type="button"
            className="scm-group-head scm-history-head"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            <span>{showHistory ? '▾' : '▸'} History</span>
            <span className="scm-count">{history.length}</span>
          </button>
          {showHistory && (
            <ul className="scm-history">
              {history.map((c) => (
                <li key={c.oid} className="scm-commit-row" title={`${c.author} · ${new Date(c.date).toLocaleString()}`}>
                  <span className="scm-oid">{c.oid}</span>
                  <span className="scm-commit-msg">{c.message}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
