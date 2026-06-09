import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';

// NOTE: '@xterm/xterm/css/xterm.css' must be included by the app bundle for
// correct rendering; it's imported at the entry point, not here, so this
// module stays type-checkable (CSS imports need a bundler).
export interface TerminalProps {
  // Working directory for the PTY (defaults to the main-process cwd).
  cwd?: string;
  // A command to run automatically once the shell is ready (e.g. 'claude').
  bootCommand?: string;
  // Text typed into the session a few seconds after the boot command, WITHOUT a
  // trailing newline — used to seed a prompt into an interactive agent (e.g.
  // FreeBuff) so the user can review it and press Enter to submit.
  seedInput?: string;
  // A local message written to the terminal on open (not sent to the PTY).
  notice?: string;
  // Font, following the editor settings.
  fontSize?: number;
  fontFamily?: string;
}

export function Terminal({ cwd, bootCommand, seedInput, notice, fontSize, fontFamily }: TerminalProps) {
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
    // Use the GPU (WebGL) renderer — the default DOM renderer makes dense TUIs
    // (FreeBuff/Claude Code: box-drawing, colours, spinners) blurry and
    // misaligned. Fall back to the DOM renderer if WebGL is unavailable or its
    // context is lost. Must be loaded AFTER term.open().
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      /* WebGL unavailable — keep the default DOM renderer */
    }
    fit.fit();
    if (notice) {
      for (const line of notice.split('\n')) term.writeln(line);
    }

    let disposed = false;

    // Seed handling: an interactive agent (FreeBuff) finishes booting at an
    // unknown time, so a fixed delay drops the prompt. Instead we watch the
    // output for the agent's "ready for input" banner and type the prompt then,
    // with a generous fallback in case the banner text changes.
    const seedText = seedInput ? seedInput.replace(/[\r\n]+/g, ' ').trim() : '';
    const READY_RE = /enter a coding task|\/ for commands|what would you like to work on/i;
    let seeded = false;
    let outBuf = '';
    const seedNow = () => {
      if (seeded || !seedText || !sessionRef.current) return;
      seeded = true;
      window.strix.terminal.input(sessionRef.current, seedText);
    };

    // PTY output → terminal (and watch for the agent's input prompt to seed).
    const offData = window.strix.terminal.onData(({ id, data }) => {
      if (id === sessionRef.current) {
        term.write(data);
        if (seedText && !seeded) {
          outBuf = (outBuf + data).slice(-2000);
          if (READY_RE.test(outBuf)) setTimeout(seedNow, 350);
        }
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
      // Fallback seed if the readiness banner is never detected (e.g. a future
      // FreeBuff redesign): type the prompt after a long grace period.
      if (seedText) {
        setTimeout(seedNow, 30000);
      }
    });

    // Keep the PTY's dimensions in sync with the RENDERED size. A ResizeObserver
    // catches every cause (panel drag, tab show/hide, window resize, late
    // layout) — a window 'resize' listener alone missed panel/tab changes, so
    // TUI apps like FreeBuff rendered at the wrong size.
    const syncSize = () => {
      fit.fit();
      if (sessionRef.current) {
        window.strix.terminal.resize(sessionRef.current, term.cols, term.rows);
      }
    };
    // ResizeObserver isn't available in some test (jsdom) environments. Only
    // refit from it when the element is actually visible (a hidden/display:none
    // tab reports 0 size — fitting that would resize the PTY to nothing).
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (el.clientWidth > 0 && el.clientHeight > 0) syncSize();
          })
        : null;
    ro?.observe(el);
    window.addEventListener('resize', syncSize);

    return () => {
      disposed = true;
      ro?.disconnect();
      window.removeEventListener('resize', syncSize);
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
