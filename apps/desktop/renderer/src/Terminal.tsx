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
  const sessionRef = useRef<string | null>(null);
  // The directory the PTY was spawned in / last cd'd to, so we only re-cd when
  // the workspace actually changes (not on the initial mount).
  const cwdRef = useRef<string | undefined>(cwd);

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

    // PTY output → terminal.
    const offData = window.strix.terminal.onData(({ id, data }) => {
      if (id === sessionRef.current) {
        term.write(data);
      }
    });

    // Keystrokes → PTY.
    const keySub = term.onData((data) => {
      if (sessionRef.current) {
        window.strix.terminal.input(sessionRef.current, data);
      }
    });

    // Spawn in the latest cwd (cwdRef may have advanced before the session was
    // ready, e.g. a folder was opened during launch).
    window.strix.terminal.create({ cols: term.cols, rows: term.rows, cwd: cwdRef.current }).then((id) => {
      if (disposed) {
        window.strix.terminal.kill(id);
        return;
      }
      sessionRef.current = id;
      // Run the boot command once the shell has had a moment to initialise.
      if (bootCommand) {
        setTimeout(() => window.strix.terminal.input(id, `${bootCommand}\r`), 400);
      }
    });

    // Keep the PTY's dimensions in sync with the rendered terminal.
    const onResize = () => {
      fit.fit();
      if (sessionRef.current) {
        window.strix.terminal.resize(sessionRef.current, term.cols, term.rows);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      offData();
      keySub.dispose();
      if (sessionRef.current) {
        window.strix.terminal.kill(sessionRef.current);
      }
      term.dispose();
    };
  }, []);

  // Follow the workspace: when the opened folder changes, cd the live shell into
  // it (instead of leaving it at the launch directory). Skips the first run.
  useEffect(() => {
    if (cwd === cwdRef.current) return;
    cwdRef.current = cwd;
    const id = sessionRef.current;
    if (!id || !cwd) return;
    // `cd "<path>"` works across PowerShell, cmd, and POSIX shells.
    window.strix.terminal.input(id, `cd "${cwd}"\r`);
  }, [cwd]);

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
