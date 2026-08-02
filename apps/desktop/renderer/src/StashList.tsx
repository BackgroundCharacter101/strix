import React from 'react';
import type { GitStashEntry } from '../../main/git';
import { timeAgo } from './timeAgo';

// git labels stashes "On <branch>: <message>" (or "WIP on <branch>: <sha> <subject>"
// when auto-generated). Repeating the branch in every row buries the part that
// tells entries apart, so split it out and show it as metadata instead.
export function parseStashLabel(message: string): { text: string; branch: string | null; wip: boolean } {
  const m = /^(WIP )?[Oo]n ([^:]+): (.*)$/.exec(message);
  if (!m) return { text: message, branch: null, wip: false };
  const wip = Boolean(m[1]);
  // An auto WIP subject starts with the commit it was taken from — drop the sha.
  const rest = wip ? m[3].replace(/^[0-9a-f]{7,40}\s+/i, '') : m[3];
  return { text: rest || message, branch: m[2], wip };
}

// The "Stashes" section of the Source Control view: one row per shelved change
// set, with pop (apply + remove), apply (keep), and drop (discard).
export function StashList({
  stashes,
  busy,
  onAct,
}: {
  stashes: GitStashEntry[];
  busy: boolean;
  onAct: (op: 'pop' | 'apply' | 'drop', ref: string) => void;
}) {
  if (stashes.length === 0) return null;
  return (
    <>
      <div className="scm-group-head">
        <span>Stashes</span>
        <span className="scm-count">{stashes.length}</span>
      </div>
      <ul className="scm-stash-list">
        {stashes.map((s) => {
          const { text, branch, wip } = parseStashLabel(s.message);
          const when = timeAgo(s.date);
          return (
            <li key={s.ref} className="scm-stash-row">
              <span className="scm-stash-main">
                <span className="scm-stash-msg" title={`${s.ref} — ${s.message}`}>
                  {text}
                </span>
                <span className="scm-stash-meta">
                  {wip && <span className="scm-stash-tag">WIP</span>}
                  {branch && <span className="scm-stash-branch">⎇ {branch}</span>}
                  {when && <span>{when}</span>}
                </span>
              </span>
              <span className="scm-stash-actions">
                <button
                  type="button"
                  className="scm-stash-btn"
                  disabled={busy}
                  title="Restore these changes and remove the stash"
                  onClick={() => onAct('pop', s.ref)}
                >
                  Pop
                </button>
                <button
                  type="button"
                  className="scm-stash-btn"
                  disabled={busy}
                  title="Restore these changes but keep the stash"
                  onClick={() => onAct('apply', s.ref)}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="scm-stash-btn is-danger"
                  disabled={busy}
                  title="Discard this stash permanently"
                  onClick={() => onAct('drop', s.ref)}
                >
                  Drop
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
