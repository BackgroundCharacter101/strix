import React from 'react';
import { languageForPath } from '@strix/editor';
import { GitStatusBar } from './GitStatusBar';
import { ErrorIcon, WarningIcon } from './icons';

export interface StatusBarProps {
  rootPath: string | null;
  path: string | null;
  dirty: boolean;
  cursor: { line: number; column: number };
  content?: string;
  problems?: { errors: number; warnings: number };
}

// Windows files use CRLF; everything else LF. Detect from the buffer.
function detectEol(content: string): string {
  return content.includes('\r\n') ? 'CRLF' : 'LF';
}

// Report the dominant indentation unit (tabs, or the smallest space indent seen).
function detectIndent(content: string): string {
  const lines = content.split('\n');
  let min = 0;
  for (const line of lines) {
    if (/^\t/.test(line)) return 'Tab Size: 4';
    const m = /^( +)\S/.exec(line);
    if (m) {
      const n = m[1].length;
      if (min === 0 || n < min) min = n;
    }
  }
  return `Spaces: ${min || 2}`;
}

export function StatusBar({
  rootPath,
  path,
  dirty,
  cursor,
  content = '',
  problems = { errors: 0, warnings: 0 },
}: StatusBarProps) {
  return (
    <footer className="statusbar" aria-label="status bar">
      <div className="statusbar-section statusbar-left">
        <GitStatusBar rootPath={rootPath} />
        <span className="statusbar-item statusbar-problems" aria-label="problems">
          <ErrorIcon /> {problems.errors}
          <WarningIcon /> {problems.warnings}
        </span>
      </div>
      <div className="statusbar-section statusbar-right">
        {path ? (
          <>
            <span className="statusbar-item">
              Ln {cursor.line}, Col {cursor.column}
            </span>
            <span className="statusbar-item">{detectIndent(content)}</span>
            <span className="statusbar-item">UTF-8</span>
            <span className="statusbar-item">{detectEol(content)}</span>
            <span className="statusbar-item">{languageForPath(path)}</span>
            {dirty && (
              <span className="statusbar-item dirty-dot" aria-label="unsaved changes">
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
