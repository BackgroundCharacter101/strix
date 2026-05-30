import React, { useEffect, useState } from 'react';
import {
  OwlIcon,
  WinMinIcon,
  WinMaxIcon,
  WinRestoreIcon,
  WinCloseIcon,
} from './icons';

const MENUS = ['File', 'Edit', 'View', 'Go', 'Help'];

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.strix.win.isMaximized().then(setMaximized);
    return window.strix.win.onMaximizeChange(setMaximized);
  }, []);

  // Pop the native submenu just below the clicked menu button.
  const openMenu = (label: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    window.strix.win.popupMenu(label, r.left, r.bottom);
  };

  return (
    <header className="titlebar" aria-label="title bar">
      <span className="app-brand">
        <OwlIcon size={16} />
        <span className="app-title">Strix</span>
      </span>
      <nav className="titlebar-menus" aria-label="application menu">
        {MENUS.map((label) => (
          <button key={label} type="button" className="titlebar-menu" onClick={(e) => openMenu(label, e)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="titlebar-drag" />
      <div className="titlebar-controls">
        <button
          type="button"
          className="win-btn"
          aria-label="Minimize"
          onClick={() => window.strix.win.minimize()}
        >
          <WinMinIcon />
        </button>
        <button
          type="button"
          className="win-btn"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          onClick={() => window.strix.win.toggleMaximize()}
        >
          {maximized ? <WinRestoreIcon /> : <WinMaxIcon />}
        </button>
        <button
          type="button"
          className="win-btn win-close"
          aria-label="Close"
          onClick={() => window.strix.win.close()}
        >
          <WinCloseIcon />
        </button>
      </div>
    </header>
  );
}
