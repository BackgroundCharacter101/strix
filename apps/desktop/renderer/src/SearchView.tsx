import React, { useEffect, useMemo, useState } from 'react';
import type { SearchMatch } from '../../main/search';
import { FileIcon } from './FileTree';

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i === -1 ? p : p.slice(i + 1);
}

export function SearchView({ onOpen }: { onOpen: (path: string, line: number) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [busy, setBusy] = useState(false);

  // Debounced search as the user types.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setBusy(true);
    const handle = window.setTimeout(() => {
      window.strix.search
        .find(q)
        .then(setResults)
        .finally(() => setBusy(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Group matches by file, preserving discovery order.
  const groups = useMemo(() => {
    const map = new Map<string, SearchMatch[]>();
    for (const m of results) {
      const list = map.get(m.path);
      if (list) list.push(m);
      else map.set(m.path, [m]);
    }
    return [...map.entries()];
  }, [results]);

  return (
    <div className="search-view">
      <input
        className="search-input"
        aria-label="Search"
        placeholder="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="search-summary">
        {busy
          ? 'Searching…'
          : query.trim() === ''
            ? ''
            : `${results.length} result${results.length === 1 ? '' : 's'} in ${groups.length} file${groups.length === 1 ? '' : 's'}`}
      </div>
      <div className="search-results" aria-label="search results">
        {groups.map(([path, matches]) => (
          <div key={path} className="search-group">
            <div className="search-file" title={path}>
              <FileIcon name={path} />
              <span className="search-file-name">{basename(path)}</span>
              <span className="search-file-count">{matches.length}</span>
            </div>
            {matches.map((m) => (
              <button
                key={`${path}:${m.line}`}
                type="button"
                className="search-match"
                onClick={() => onOpen(m.path, m.line)}
              >
                <span className="search-line">{m.line}</span>
                <span className="search-text">{m.text}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
