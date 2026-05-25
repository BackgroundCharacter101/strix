import React from 'react';
import { languageForPath } from '@strix/editor';

export interface StatusBarProps {
  path: string | null;
  dirty: boolean;
  cursor: { line: number; column: number };
}

export function StatusBar({ path, dirty, cursor }: StatusBarProps) {
  return (
    <footer className="statusbar" aria-label="status bar">
      {path ? (
        <>
          <span>{languageForPath(path)}</span>
          <span>
            Ln {cursor.line}, Col {cursor.column}
          </span>
          {dirty && <span>● unsaved</span>}
        </>
      ) : (
        <span>Ready</span>
      )}
    </footer>
  );
}
