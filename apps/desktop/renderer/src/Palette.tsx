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

export function Palette({
  items,
  placeholder,
  onSelect,
  onClose,
}: {
  items: PaletteItem[];
  placeholder: string;
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
    const q = query.trim().toLowerCase();
    const matches = q
      ? items.filter((it) => `${it.label} ${it.detail ?? ''}`.toLowerCase().includes(q))
      : items;
    return matches.slice(0, MAX_RESULTS);
  }, [items, query]);

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
      if (item) onSelect(item);
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
          {filtered.map((it, i) => (
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
              <span className="palette-label">{it.label}</span>
              {it.detail && <span className="palette-detail">{it.detail}</span>}
            </li>
          ))}
          {filtered.length === 0 && <li className="palette-empty">No results</li>}
        </ul>
      </div>
    </div>
  );
}
