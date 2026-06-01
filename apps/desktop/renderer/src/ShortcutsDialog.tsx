import React, { useEffect, useMemo, useRef, useState } from 'react';

interface Shortcut {
  keys: string;
  label: string;
}
interface Group {
  name: string;
  items: Shortcut[];
}

// The actual keybindings wired in App.tsx / monaco-setup.ts. Keep in sync.
const SHORTCUTS: Group[] = [
  {
    name: 'General',
    items: [
      { keys: 'Ctrl+Shift+P', label: 'Command Palette' },
      { keys: 'Ctrl+P', label: 'Quick Open file' },
      { keys: 'Ctrl+O', label: 'Open File' },
    ],
  },
  {
    name: 'Editing',
    items: [
      { keys: 'Ctrl+S', label: 'Save' },
      { keys: 'Ctrl+K S', label: 'Save All' },
      { keys: 'Shift+Alt+F', label: 'Format Document' },
      { keys: 'Ctrl+G', label: 'Generate from “# generate:” comment' },
    ],
  },
  {
    name: 'View',
    items: [
      { keys: 'Ctrl+B', label: 'Toggle Sidebar' },
      { keys: 'Ctrl+`', label: 'Toggle Terminal' },
      { keys: 'Ctrl+\\', label: 'Split Editor' },
      { keys: 'Ctrl+W', label: 'Close Editor' },
      { keys: 'Ctrl+K Z', label: 'Toggle Zen Mode' },
      { keys: 'Esc', label: 'Exit Zen Mode' },
    ],
  },
  {
    name: 'Search',
    items: [{ keys: 'Ctrl+Shift+F', label: 'Search in Files' }],
  },
];

// Render a keybinding string like "Ctrl+K S" as styled <kbd> chips. Space
// separates chord steps; "+" separates simultaneous keys within a step.
function Keys({ keys }: { keys: string }) {
  return (
    <span className="kbd-combo">
      {keys.split(' ').map((step, si) => (
        <span key={si} className="kbd-step">
          {step.split('+').map((k, ki) => (
            <kbd key={ki}>{k}</kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUTS;
    return SHORTCUTS.map((g) => ({
      ...g,
      items: g.items.filter(
        (s) => s.label.toLowerCase().includes(q) || s.keys.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div
        className="dialog shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title">Keyboard Shortcuts</h2>
        <input
          ref={inputRef}
          className="dialog-input"
          aria-label="Filter shortcuts"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="shortcuts-body">
          {groups.map((g) => (
            <section key={g.name} className="shortcuts-group">
              <h3 className="shortcuts-group-name">{g.name}</h3>
              {g.items.map((s) => (
                <div key={s.label} className="shortcuts-row">
                  <span className="shortcuts-label">{s.label}</span>
                  <Keys keys={s.keys} />
                </div>
              ))}
            </section>
          ))}
          {groups.length === 0 && <p className="palette-empty">No matching shortcuts</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
