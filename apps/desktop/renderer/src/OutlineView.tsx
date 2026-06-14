import React, { useMemo, useState } from 'react';
import { extractSymbols, filterSymbols, type SymbolKind } from './symbols';

// Short badge per symbol kind (mirrors the file-tree badge style).
const KIND_BADGE: Record<SymbolKind, string> = {
  class: 'C',
  interface: 'I',
  type: 'T',
  enum: 'E',
  function: 'ƒ',
  method: 'm',
  const: 'c',
  heading: 'H',
  rule: '§',
};

export function OutlineView({
  path,
  content,
  onJump,
}: {
  path: string | null;
  content: string;
  onJump: (line: number) => void;
}) {
  const [filter, setFilter] = useState('');
  const symbols = useMemo(() => (path ? extractSymbols(path, content) : []), [path, content]);
  const shown = useMemo(() => filterSymbols(symbols, filter), [symbols, filter]);

  if (!path) {
    return (
      <div className="outline-view">
        <p className="muted outline-empty">Open a file to see its outline.</p>
      </div>
    );
  }

  return (
    <div className="outline-view">
      <input
        className="search-input"
        aria-label="Filter symbols"
        placeholder="Go to symbol…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="outline-summary" aria-live="polite">
        {symbols.length === 0
          ? 'No symbols'
          : `${shown.length}${shown.length !== symbols.length ? `/${symbols.length}` : ''} symbol${symbols.length === 1 ? '' : 's'}`}
      </div>
      <div className="outline-list" aria-label="outline">
        {shown.map((s) => (
          <button
            key={`${s.line}:${s.name}`}
            type="button"
            className={`outline-item kind-${s.kind}`}
            onClick={() => onJump(s.line)}
          >
            <span className="outline-badge" aria-hidden="true">
              {KIND_BADGE[s.kind]}
            </span>
            <span className="outline-name">{s.name}</span>
            <span className="outline-line">{s.line}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
