import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileIcon } from './FileTree';

export interface PaletteItem {
  id: string;
  label: string;
  detail?: string;
  // When set, render a file-type glyph using this filename.
  icon?: string;
}

const MAX_RESULTS = 50;

// Fuzzy subsequence match: every query char must appear in order. Returns the
// matched label-character indices (for highlighting) and a relevance score, or
// null if it doesn't match.
function fuzzyMatch(query: string, text: string): { score: number; indices: number[] } | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let last = -2;
  const indices: number[] = [];
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      indices.push(i);
      score += last === i - 1 ? 6 : 1; // consecutive bonus
      if (i === 0 || /[\s/._-]/.test(t[i - 1])) score += 4; // word-start bonus
      last = i;
      qi++;
    }
  }
  return qi === q.length ? { score, indices } : null;
}

// Render a label with the matched characters highlighted.
function highlight(label: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) return label;
  const set = new Set(indices);
  return [...label].map((ch, i) =>
    set.has(i) ? (
      <mark key={i} className="palette-hl">
        {ch}
      </mark>
    ) : (
      <span key={i}>{ch}</span>
    ),
  );
}

export function Palette({
  items,
  placeholder,
  recentIds = [],
  onSelect,
  onClose,
}: {
  items: PaletteItem[];
  placeholder: string;
  // Ids shown first (most-recent first) when the query is empty.
  recentIds?: string[];
  onSelect: (item: PaletteItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) {
      // Empty query: recently-used first (in recency order), then the rest.
      const rank = new Map(recentIds.map((id, i) => [id, i]));
      const ordered = [...items].sort(
        (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
      );
      return ordered.slice(0, MAX_RESULTS).map((it) => ({ it, indices: [] as number[] }));
    }
    const scored: { it: PaletteItem; indices: number[]; score: number }[] = [];
    for (const it of items) {
      const labelM = fuzzyMatch(q, it.label);
      const combinedM = labelM ?? fuzzyMatch(q, `${it.label} ${it.detail ?? ''}`);
      if (!combinedM) continue;
      scored.push({ it, indices: labelM?.indices ?? [], score: combinedM.score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS);
  }, [items, query, recentIds]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[index];
      if (item) onSelect(item.it);
    }
  };

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul className="palette-list" role="listbox">
          {filtered.map(({ it, indices }, i) => (
            <li
              key={it.id}
              role="option"
              aria-selected={i === index}
              className="palette-item"
              data-active={i === index}
              onMouseEnter={() => setIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(it);
              }}
            >
              {it.icon && <FileIcon name={it.icon} />}
              <span className="palette-label">{highlight(it.label, indices)}</span>
              {it.detail && <span className="palette-detail">{it.detail}</span>}
            </li>
          ))}
          {filtered.length === 0 && <li className="palette-empty">No results</li>}
        </ul>
      </div>
    </div>
  );
}
