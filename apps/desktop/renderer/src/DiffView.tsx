import React from 'react';
import { DiffViewer, languageForPath } from '@strix/editor';

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i === -1 ? p : p.slice(i + 1);
}

// Read-only diff of a file's committed (HEAD) content vs its working copy.
export function DiffView({
  path,
  original,
  modified,
  theme,
  onClose,
}: {
  path: string;
  original: string;
  modified: string;
  theme?: string;
  onClose: () => void;
}) {
  return (
    <div className="diff-view" aria-label="diff view">
      <div className="diff-toolbar">
        <span className="diff-title">{basename(path)} (Working Tree)</span>
        <button type="button" className="ai-ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="diff-host">
        <DiffViewer
          original={original}
          modified={modified}
          language={languageForPath(path)}
          theme={theme}
        />
      </div>
    </div>
  );
}
