import React from 'react';
import type { GitStashEntry } from '../../main/git';

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
      <ul className="scm-list scm-stash-list">
        {stashes.map((s) => (
          <li
            key={s.ref}
            className="scm-stash-row"
            title={`${s.ref} · ${new Date(s.date).toLocaleString()}`}
          >
            <span className="scm-stash-msg">{s.message}</span>
            <span className="scm-stash-actions">
              <button
                type="button"
                className="scm-link"
                disabled={busy}
                title="Apply these changes and remove the stash"
                onClick={() => onAct('pop', s.ref)}
              >
                Pop
              </button>
              <button
                type="button"
                className="scm-link"
                disabled={busy}
                title="Apply these changes but keep the stash"
                onClick={() => onAct('apply', s.ref)}
              >
                Apply
              </button>
              <button
                type="button"
                className="scm-link scm-danger"
                disabled={busy}
                title="Discard this stash permanently"
                onClick={() => onAct('drop', s.ref)}
              >
                Drop
              </button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
