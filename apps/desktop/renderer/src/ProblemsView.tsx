import React from 'react';
import type { Problem } from './FileViewer';
import { FileIcon } from './FileTree';

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i === -1 ? p : p.slice(i + 1);
}

const ICON: Record<Problem['severity'], string> = { error: '⛔', warning: '⚠️', info: 'ℹ️' };

// Lists diagnostics for the open editors (markers exist only for live editors).
// Click a row to jump to the file + line.
export function ProblemsView({
  byPath,
  onOpen,
}: {
  byPath: Record<string, Problem[]>;
  onOpen: (path: string, line: number) => void;
}) {
  const entries = Object.entries(byPath).filter(([, items]) => items.length > 0);
  const total = entries.reduce((n, [, items]) => n + items.length, 0);

  if (total === 0) {
    return <p className="muted">No problems detected in open files.</p>;
  }

  return (
    <div className="problems-view" aria-label="problems">
      {entries.map(([path, items]) => (
        <div key={path} className="problems-group">
          <div className="problems-file" title={path}>
            <FileIcon name={path} />
            <span className="problems-file-name">{basename(path)}</span>
            <span className="problems-count">{items.length}</span>
          </div>
          {items.map((p, i) => (
            <button
              key={`${path}:${i}`}
              type="button"
              className={`problems-row problems-${p.severity}`}
              title={p.message}
              onClick={() => onOpen(path, p.line)}
            >
              <span className="problems-sev">{ICON[p.severity]}</span>
              <span className="problems-msg">{p.message}</span>
              <span className="problems-loc">
                {p.line}:{p.column}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
