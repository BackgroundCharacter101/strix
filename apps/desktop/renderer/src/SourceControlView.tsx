import React, { useCallback, useEffect, useState } from 'react';
import type { GitBranches, GitLogEntry, GitStashEntry } from '../../main/git';
import { useGitStatusState } from './useGitStatus';
import { FileIcon } from './FileTree';
import { showToast } from './toast';
import { SparkleIcon } from './icons';
import { COMMIT_MESSAGE_INSTRUCTION, cleanCommitMessage } from './commitMessage';
import { freellmComplete } from './aiComplete';
import { StashList } from './StashList';

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
  const [stashes, setStashes] = useState<GitStashEntry[]>([]);
  const [newBranch, setNewBranch] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  // The branch a switch was blocked on by uncommitted changes — drives the
  // "stash & switch?" confirm bar.
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);

  const repoBranch = status?.branch ?? null;
  const reloadGit = useCallback(() => {
    if (!rootPath || !status?.isRepo) {
      setBranches(null);
      setHistory([]);
      setStashes([]);
      return;
    }
    window.strix.git.listBranches(rootPath).then(setBranches).catch(() => {});
    window.strix.git.log(rootPath, 30).then(setHistory).catch(() => {});
    window.strix.git.stashList(rootPath).then(setStashes).catch(() => {});
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
      const msg = message.trim();
      if (!msg) {
        showToast('Enter a commit message first.', 'info');
        return;
      }
      // Like VS Code: if nothing is staged, stage everything and commit it.
      if (staged.length === 0) {
        if (unstaged.length === 0) {
          showToast('Nothing to commit.', 'info');
          return;
        }
        await window.strix.git.stageAll(rootPath!);
      }
      await window.strix.git.commit(rootPath!, msg);
      setMessage('');
      showToast('Changes committed', 'success');
    });

  // A blocked checkout looks the same from isomorphic-git and system git.
  const CONFLICT_RE = /would be overwritten|checkoutconflict|commit your changes or stash/i;

  const switchBranch = (ref: string) => {
    if (!rootPath || busy || ref === status.branch) return;
    setBusy(true);
    void (async () => {
      try {
        await window.strix.git.checkout(rootPath, ref);
        showToast(`Switched to ${ref}`, 'success', 2500);
        setPendingSwitch(null);
        reload();
        reloadGit();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Uncommitted changes block the switch — offer to stash instead of
        // dead-ending with a raw error (the whole point of this fix).
        if (CONFLICT_RE.test(msg)) setPendingSwitch(ref);
        else showToast(`Git: ${msg}`, 'error', 8000);
      } finally {
        setBusy(false);
      }
    })();
  };

  // Shelve the blocking changes, then complete the switch. The work is safe in
  // the stash list and can be restored from the Stashes panel.
  const stashAndSwitch = () => {
    const ref = pendingSwitch;
    if (!ref || !rootPath || busy) return;
    setBusy(true);
    void (async () => {
      try {
        const res = await window.strix.git.stashPush(rootPath, `Before switching to ${ref}`, true);
        if (!res.ok) {
          showToast(`Stash: ${res.output}`, 'error', 8000);
          return;
        }
        await window.strix.git.checkout(rootPath, ref);
        showToast(`Switched to ${ref} — your changes are stashed below.`, 'success', 5000);
        setPendingSwitch(null);
        reload();
        reloadGit();
      } catch (e) {
        showToast(`Git: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000);
      } finally {
        setBusy(false);
      }
    })();
  };

  // Manual "Stash" button — shelve tracked changes (leaves untracked files).
  const stashCurrent = () =>
    void guard(async () => {
      const res = await window.strix.git.stashPush(rootPath!);
      showToast(res.ok ? 'Changes stashed' : res.output, res.ok ? 'success' : 'info');
      reloadGit();
    });

  // Restore / discard a stash entry.
  const stashAct = (op: 'pop' | 'apply' | 'drop', ref: string) =>
    void guard(async () => {
      const api = window.strix.git;
      const res =
        op === 'pop'
          ? await api.stashPop(rootPath!, ref)
          : op === 'apply'
            ? await api.stashApply(rootPath!, ref)
            : await api.stashDrop(rootPath!, ref);
      const label = op === 'pop' ? 'restored' : op === 'apply' ? 'applied' : 'dropped';
      showToast(res.ok ? `Stash ${label}` : res.output, res.ok ? 'success' : 'error', res.ok ? 3000 : 9000);
      reloadGit();
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
      let diff = (await window.strix.git.diffStaged(rootPath)).slice(0, 12_000);
      if (!diff.trim()) {
        // Nothing staged — stage everything so we can describe it (the commit
        // will use the same staged changes).
        await window.strix.git.stageAll(rootPath);
        reloadGit();
        diff = (await window.strix.git.diffStaged(rootPath)).slice(0, 12_000);
      }
      if (!diff.trim()) {
        showToast('No changes to describe.', 'info');
        return;
      }
      await window.strix.ai.ensure(aiServerUrl || undefined);
      // Route through the main process (FreeLLMAPI proxy). A renderer-direct
      // completion is CORS-blocked from the packaged file:// origin, which is why
      // "Generate" silently did nothing in shipped builds.
      const reply = await freellmComplete({
        serverUrl: aiServerUrl || '',
        model: 'auto',
        messages: [
          { role: 'system', content: COMMIT_MESSAGE_INSTRUCTION },
          { role: 'user', content: diff },
        ],
        maxTokens: 512,
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
      {pendingSwitch && (
        <div className="scm-switch-confirm" role="alert">
          <span>
            Unsaved changes block the switch to <strong>{pendingSwitch}</strong>. Stash them and
            switch? (restore later from Stashes)
          </span>
          <div className="scm-switch-actions">
            <button type="button" className="scm-commit-btn" disabled={busy} onClick={stashAndSwitch}>
              Stash &amp; switch
            </button>
            <button
              type="button"
              className="scm-link"
              disabled={busy}
              onClick={() => setPendingSwitch(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
            <span className="scm-head-actions">
              <button
                type="button"
                className="scm-link"
                disabled={busy}
                title="Shelve your changes so you can switch branches"
                onClick={stashCurrent}
              >
                Stash
              </button>
              <button type="button" className="scm-link" disabled={busy} onClick={stageAll}>
                Stage all
              </button>
            </span>
          </div>
          <ul className="scm-list">{unstaged.map((f) => fileRow(f, 'stage'))}</ul>
        </>
      )}

      <StashList stashes={stashes} busy={busy} onAct={stashAct} />

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
