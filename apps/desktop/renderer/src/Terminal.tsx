import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

// NOTE: '@xterm/xterm/css/xterm.css' must be included by the app bundle for
// correct rendering; it's imported at the entry point, not here, so this
// module stays type-checkable (CSS imports need a bundler).
export interface TerminalProps {
  // Working directory for the PTY (defaults to the main-process cwd).
  cwd?: string;
  // A command to run automatically once the shell is ready (e.g. 'claude').
  bootCommand?: string;
  // A local message written to the terminal on open (not sent to the PTY).
  notice?: string;
  // Font, following the editor settings.
  fontSize?: number;
  fontFamily?: string;
}

export function Terminal({ cwd, bootCommand, notice, fontSize, fontFamily }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const term = new XTerm({
      convertEol: true,
      fontSize: fontSize ?? 13,
      fontFamily: fontFamily || 'Cascadia Code, Consolas, monospace',
    });
    termRef.current = term;
    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    if (notice) {
      for (const line of notice.split('\n')) term.writeln(line);
    }

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

    window.strix.terminal.create({ cols: term.cols, rows: term.rows, cwd }).then((id) => {
      if (disposed) {
        window.strix.terminal.kill(id);
        return;
      }
      sessionId = id;
      // Run the boot command once the shell has had a moment to initialise.
      if (bootCommand) {
        setTimeout(() => window.strix.terminal.input(id, `${bootCommand}\r`), 400);
      }
    });

    // Keep the PTY's dimensions in sync with the rendered terminal.
    const onResize = () => {
      fit.fit();
      if (sessionId) {
        window.strix.terminal.resize(sessionId, term.cols, term.rows);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      offData();
      keySub.dispose();
      if (sessionId) {
        window.strix.terminal.kill(sessionId);
      }
      term.dispose();
    };
  }, []);

  // Apply font changes from Settings to the live terminal (no PTY restart).
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize ?? 13;
    term.options.fontFamily = fontFamily || 'Cascadia Code, Consolas, monospace';
    fitRef.current?.fit();
  }, [fontSize, fontFamily]);

  return <div className="terminal-host" aria-label="terminal" ref={containerRef} />;
}
