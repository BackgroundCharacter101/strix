import React from 'react';
import { languageForPath } from '@strix/editor';
import { GitStatusBar } from './GitStatusBar';

export interface StatusBarProps {
  rootPath: string | null;
  path: string | null;
  dirty: boolean;
  cursor: { line: number; column: number };
}

export function StatusBar({ rootPath, path, dirty, cursor }: StatusBarProps) {
  return (
    <footer className="statusbar" aria-label="status bar">
      <div className="statusbar-section statusbar-left">
        <GitStatusBar rootPath={rootPath} />
      </div>
      <div className="statusbar-section statusbar-right">
        {path ? (
          <>
            <span className="statusbar-item">
              Ln {cursor.line}, Col {cursor.column}
            </span>
            <span className="statusbar-item">Spaces: 2</span>
            <span className="statusbar-item">UTF-8</span>
            <span className="statusbar-item">CRLF</span>
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
