import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

// NOTE: '@xterm/xterm/css/xterm.css' must be included by the app bundle for
// correct rendering; it's imported at the entry point, not here, so this
// module stays type-checkable (CSS imports need a bundler).
export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const term = new XTerm({ convertEol: true, fontSize: 13 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    let disposed = false;
    let sessionId: string | null = null;

    // PTY output → terminal.
    const offData = window.strix.terminal.onData(({ id, data }) => {
      if (id === sessionId) {
        term.write(data);
      }
    });

    // Keystrokes → PTY.
    const keySub = term.onData((data) => {
      if (sessionId) {
        window.strix.terminal.input(sessionId, data);
      }
    });

    window.strix.terminal.create({ cols: term.cols, rows: term.rows }).then((id) => {
      if (disposed) {
        window.strix.terminal.kill(id);
        return;
      }
      sessionId = id;
    });

    return () => {
      disposed = true;
      offData();
      keySub.dispose();
      if (sessionId) {
        window.strix.terminal.kill(sessionId);
      }
      term.dispose();
    };
  }, []);

  return <div aria-label="terminal" ref={containerRef} style={{ height: 240 }} />;
}
