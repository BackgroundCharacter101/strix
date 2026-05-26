import React, { useEffect } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="context-overlay" onMouseDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <ul
        className="context-menu"
        role="menu"
        style={{ left: x, top: y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <li key={item.label} role="none">
            <button
              type="button"
              role="menuitem"
              className="context-item"
              data-danger={item.danger ? 'true' : undefined}
              onClick={() => {
                item.onClick();
                onClose();
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
