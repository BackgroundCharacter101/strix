import React, { useEffect, useMemo, useState } from 'react';
import type { SearchMatch } from '../../main/search';
import { FileIcon } from './FileTree';
import { showToast } from './toast';

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i === -1 ? p : p.slice(i + 1);
}

export function SearchView({ onOpen }: { onOpen: (path: string, line: number) => void }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const opts = useMemo(() => ({ caseSensitive, wholeWord }), [caseSensitive, wholeWord]);

  const replaceAll = async () => {
    const q = query.trim();
    if (!q || replacing) return;
    const fileCount = new Set(results.map((m) => m.path)).size;
    const how = `${caseSensitive ? 'case-sensitive' : 'case-insensitive'}${wholeWord ? ', whole-word' : ''}`;
    const ok = window.confirm(
      `Replace all ${how} occurrences of "${q}" with "${replacement}" across ${fileCount} file(s)?\n\nThis writes to disk. Use Git or Undo (Ctrl+Z per file) to revert.`,
    );
    if (!ok) return;
    setReplacing(true);
    try {
      const res = await window.strix.search.replace(q, replacement, opts);
      showToast(
        `Replaced ${res.occurrences} occurrence(s) in ${res.files} file(s)`,
        'success',
        4000,
      );
      // Re-run the search to refresh the (now-fewer) matches.
      const next = await window.strix.search.find(q, opts);
      setResults(next);
    } catch (e) {
      showToast(`Replace failed: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000);
    } finally {
      setReplacing(false);
    }
  };

  // Debounced search as the user types (or when match options change).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setBusy(true);
    const handle = window.setTimeout(() => {
      window.strix.search
        .find(q, opts)
        .then(setResults)
        .finally(() => setBusy(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, opts]);

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
      <div className="search-row">
        <button
          type="button"
          className="search-toggle"
          aria-label={showReplace ? 'Hide replace' : 'Show replace'}
          aria-expanded={showReplace}
          title="Toggle Replace"
          onClick={() => setShowReplace((v) => !v)}
        >
          {showReplace ? '▾' : '▸'}
        </button>
        <input
          className="search-input"
          aria-label="Search"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className={`search-opt${caseSensitive ? ' active' : ''}`}
          aria-label="Match case"
          aria-pressed={caseSensitive}
          title="Match Case"
          onClick={() => setCaseSensitive((v) => !v)}
        >
          Aa
        </button>
        <button
          type="button"
          className={`search-opt${wholeWord ? ' active' : ''}`}
          aria-label="Match whole word"
          aria-pressed={wholeWord}
          title="Match Whole Word"
          onClick={() => setWholeWord((v) => !v)}
        >
          ab
        </button>
      </div>
      {showReplace && (
        <div className="search-row search-replace-row">
          <span className="search-toggle-spacer" />
          <input
            className="search-input"
            aria-label="Replace"
            placeholder="Replace"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
          <button
            type="button"
            className="search-replace-all"
            aria-label="Replace all"
            title="Replace all matches across files"
            disabled={busy || replacing || results.length === 0}
            onClick={() => void replaceAll()}
          >
            {replacing ? '…' : 'Replace All'}
          </button>
        </div>
      )}
      <div className="search-summary" aria-live="polite">
        {busy
          ? 'Searching…'
          : query.trim() === ''
            ? ''
            : results.length === 0
              ? 'No matches'
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
