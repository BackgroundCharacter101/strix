import React from 'react';
import { languageForPath } from '@strix/editor';
import type { GitStatus } from '../../main/git';
import { GitStatusBar } from './GitStatusBar';
import { ErrorIcon, WarningIcon } from './icons';

export interface StatusBarProps {
  gitStatus: GitStatus | null;
  path: string | null;
  dirty: boolean;
  cursor: { line: number; column: number };
  content?: string;
  problems?: { errors: number; warnings: number };
  onOpenScm?: () => void;
  mode?: 'normal' | 'cybersec';
  onToggleMode?: () => void;
}

// Windows files use CRLF; everything else LF. Detect from the buffer.
function detectEol(content: string): string {
  return content.includes('\r\n') ? 'CRLF' : 'LF';
}

// Report the dominant indentation unit: tabs, or the most common small (1-8)
// space indent. Capping at 8 avoids ASCII-art/aligned lines skewing the result.
function detectIndent(content: string): string {
  const counts = new Map<number, number>();
  for (const line of content.split('\n')) {
    if (/^\t/.test(line)) return 'Tab Size: 4';
    const m = /^( +)\S/.exec(line);
    if (m) {
      const n = m[1].length;
      if (n >= 1 && n <= 8) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  let best = 4;
  let bestCount = -1;
  for (const [n, c] of counts) {
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return `Spaces: ${best}`;
}

export function StatusBar({
  gitStatus,
  path,
  dirty,
  cursor,
  content = '',
  problems = { errors: 0, warnings: 0 },
  onOpenScm,
  mode = 'normal',
  onToggleMode,
}: StatusBarProps) {
  return (
    <footer className="statusbar" aria-label="status bar">
      <div className="statusbar-section statusbar-left">
        {onToggleMode && (
          <button
            type="button"
            className={`statusbar-item statusbar-btn statusbar-mode${mode === 'cybersec' ? ' is-cybersec' : ''}`}
            aria-label={`workbench mode: ${mode === 'cybersec' ? 'Cybersec' : 'Normal'}, click to toggle`}
            title={
              mode === 'cybersec'
                ? 'Cybersec mode — click to switch to Normal'
                : 'Normal mode — click to switch to Cybersec'
            }
            onClick={onToggleMode}
          >
            {mode === 'cybersec' ? '◆ CYBERSEC' : '◇ Normal'}
          </button>
        )}
        <GitStatusBar status={gitStatus} onClick={onOpenScm} />
        <button
          type="button"
          className="statusbar-item statusbar-problems statusbar-btn"
          aria-label="problems"
          title={`${problems.errors} errors, ${problems.warnings} warnings — open Source Control`}
          onClick={onOpenScm}
        >
          <ErrorIcon /> {problems.errors}
          <WarningIcon /> {problems.warnings}
        </button>
      </div>
      <div className="statusbar-section statusbar-right">
        {path ? (
          <>
            <span className="statusbar-item" title="Line and column">
              Ln {cursor.line}, Col {cursor.column}
            </span>
            <span className="statusbar-item" title="Indentation">
              {detectIndent(content)}
            </span>
            <span className="statusbar-item" title="Encoding">
              UTF-8
            </span>
            <span className="statusbar-item" title="End of line sequence">
              {detectEol(content)}
            </span>
            <span className="statusbar-item" title="Language mode">
              {languageForPath(path)}
            </span>
            {dirty && (
              <span className="statusbar-item dirty-dot" aria-label="unsaved changes" title="Unsaved changes">
                ●
              </span>
            )}
          </>
        ) : (
          <span className="statusbar-item statusbar-muted">Ready</span>
        )}
      </div>
    </footer>
  );
}
