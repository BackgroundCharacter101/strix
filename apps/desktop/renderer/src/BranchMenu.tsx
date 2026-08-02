import React, { useState } from 'react';
import { GitBranchIcon } from './icons';
import { useDismiss } from './useDismiss';

// The branch control for Source Control: one button showing where you are,
// opening a menu of local branches plus "New branch…". This replaces a bare
// <select> AND a permanently visible "New branch…" input — a whole row spent on
// an action taken maybe once a week.
export function BranchMenu({
  current,
  branches,
  busy,
  onSwitch,
  onCreate,
}: {
  current: string | null;
  branches: string[];
  busy: boolean;
  onSwitch: (ref: string) => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const close = () => {
    setOpen(false);
    setCreating(false);
    setName('');
  };

  // Close on Escape or a click outside — shared with the panel's other menus.
  const wrapRef = useDismiss<HTMLDivElement>(open, close);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    close();
  };

  return (
    <div className="scm-branch" ref={wrapRef}>
      <button
        type="button"
        className="scm-branch-btn"
        aria-label={`Branch: ${current ?? 'detached HEAD'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => {
          if (open) {
            close();
          } else {
            setOpen(true);
          }
        }}
      >
        <GitBranchIcon size={13} />
        <span className="scm-branch-name">{current ?? 'detached HEAD'}</span>
        <span className="scm-branch-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="scm-branch-menu" role="menu">
          {branches.map((b) => (
            <button
              key={b}
              type="button"
              role="menuitem"
              className={`scm-branch-item${b === current ? ' is-current' : ''}`}
              onClick={() => {
                close();
                if (b !== current) onSwitch(b);
              }}
            >
              <span className="scm-branch-check" aria-hidden>
                {b === current ? '✓' : ''}
              </span>
              {b}
            </button>
          ))}

          <div className="scm-branch-sep" role="separator" />

          {creating ? (
            <input
              className="scm-branch-input"
              aria-label="New branch name"
              placeholder="branch name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          ) : (
            <button
              type="button"
              role="menuitem"
              className="scm-branch-item"
              onClick={() => setCreating(true)}
            >
              <span className="scm-branch-check" aria-hidden>
                +
              </span>
              New branch…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
