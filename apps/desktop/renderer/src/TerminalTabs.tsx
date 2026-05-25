import React, { useState } from 'react';
import { Terminal } from './Terminal';

export function TerminalTabs() {
  const [tabs, setTabs] = useState<number[]>([0]);
  const [active, setActive] = useState(0);
  const [nextId, setNextId] = useState(1);

  const addTab = () => {
    setTabs((prev) => [...prev, nextId]);
    setActive(nextId);
    setNextId((n) => n + 1);
  };

  const closeTab = (id: number) => {
    const remaining = tabs.filter((x) => x !== id);
    setTabs(remaining);
    if (active === id) {
      setActive(remaining.length ? remaining[remaining.length - 1] : -1);
    }
  };

  return (
    <div className="terminal-tabs" aria-label="terminals">
      <div className="tablist" role="tablist">
        {tabs.map((id) => (
          <span key={id}>
            <button
              type="button"
              role="tab"
              aria-selected={id === active}
              onClick={() => setActive(id)}
            >
              Terminal {id + 1}
            </button>
            <button
              type="button"
              aria-label={`close terminal ${id + 1}`}
              onClick={() => closeTab(id)}
            >
              ×
            </button>
          </span>
        ))}
        <button type="button" aria-label="new terminal" onClick={addTab}>
          +
        </button>
      </div>
      {/* Each tab keeps its own Terminal mounted (hidden, not unmounted) so its
          PTY session and scrollback survive tab switches. */}
      <div className="terminal-content">
        {tabs.map((id) => (
          <div
            key={id}
            className="terminal-slot"
            style={{ display: id === active ? 'block' : 'none' }}
          >
            <Terminal />
          </div>
        ))}
      </div>
    </div>
  );
}
