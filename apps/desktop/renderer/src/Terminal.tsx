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
  // A prompt to type into an interactive agent (FreeBuff) and auto-submit. The
  // prompt is typed once the agent's input is ready (cold start) or immediately
  // (warm session). Bump `nonce` to re-prompt an already-running session.
  seed?: { nonce: number; text: string };
  // Extra env merged over the inherited environment for this PTY (FreeBuff →
  // user's own VPS / full-access backend).
  env?: Record<string, string>;
  // A local message written to the terminal on open (not sent to the PTY).
  notice?: string;
  // Font, following the editor settings.
  fontSize?: number;
  fontFamily?: string;
  cursorStyle?: 'block' | 'underline' | 'bar';
  // Shell override for the PTY (blank = platform default).
  shell?: string;
  // Raw PTY output chunks (after writing to xterm) — used to scrape FreeBuff's
  // usage/limit line for the progress bar.
  onData?: (chunk: string) => void;
}

export function Terminal({
  cwd,
  bootCommand,
  seed,
  env,
  notice,
  fontSize,
  fontFamily,
  cursorStyle,
  shell,
  onData,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Latest onData in a ref so the PTY subscription never needs re-binding.
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  // Seed state shared between the mount effect (cold-start, banner-detected) and
  // the re-seed effect (warm session). `ready` flips true once the agent's input
  // prompt has appeared; `pending` holds a seed waiting for that.
  const readyRef = useRef(false);
  const pendingSeedRef = useRef<{ nonce: number; text: string } | null>(null);
  const lastSeedNonceRef = useRef(0);

  // Type a prompt into the live agent session and auto-submit it (Enter shortly
  // after, so the agent receives the text first, then the newline).
  const typeSeed = (text: string) => {
    const id = sessionRef.current;
    if (!id) return;
    const clean = text.replace(/[\r\n]+/g, ' ').trim();
    if (!clean) return;
    window.strix.terminal.input(id, clean);
    setTimeout(() => {
      if (sessionRef.current) window.strix.terminal.input(sessionRef.current, '\r');
    }, 250);
  };
  // The directory the PTY was spawned in / last cd'd to, so we only re-cd when
  // the workspace actually changes (not on the initial mount).
  const cwdRef = useRef<string | undefined>(cwd);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const isWindows = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);
    const term = new XTerm({
      // MUST stay false for raw-mode TUIs (FreeBuff / Claude Code). Forcing
      // \n → \r\n drags the cursor to column 0 on a bare line-feed, which
      // corrupts the agent's in-place redraws — the tell-tale leftover
      // characters running down the left edge. The PTY already emits CRLF.
      convertEol: false,
      scrollback: 5000,
      fontSize: fontSize ?? 13,
      fontFamily: fontFamily || 'Cascadia Code, Consolas, monospace',
      cursorStyle: cursorStyle ?? 'block',
      // On Windows node-pty uses ConPTY, which has its own reflow/wrapping
      // behaviour; telling xterm about it fixes redraw artifacts on resize.
      ...(isWindows ? { windowsPty: { backend: 'conpty' as const } } : {}),
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

    // An interactive agent (FreeBuff) finishes booting at an unknown time, so a
    // fixed delay drops the prompt. Watch the output for the agent's "ready for
    // input" banner; when seen, mark ready and type any pending seed.
    const READY_RE = /enter a coding task|\/ for commands|what would you like to work on/i;
    let outBuf = '';
    const flushPendingSeed = () => {
      const p = pendingSeedRef.current;
      if (!p) return;
      pendingSeedRef.current = null;
      lastSeedNonceRef.current = p.nonce;
      typeSeed(p.text);
    };

    // PTY output → terminal (and watch for the agent's input prompt to seed).
    const offData = window.strix.terminal.onData(({ id, data }) => {
      if (id === sessionRef.current) {
        term.write(data);
        onDataRef.current?.(data);
        if (!readyRef.current) {
          outBuf = (outBuf + data).slice(-2000);
          if (READY_RE.test(outBuf)) {
            readyRef.current = true;
            setTimeout(flushPendingSeed, 350);
          }
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
    window.strix.terminal
      .create({ cols: term.cols, rows: term.rows, cwd: cwdRef.current, env, shell })
      .then((id) => {
      if (disposed) {
        window.strix.terminal.kill(id);
        return;
      }
      sessionRef.current = id;
      // Run the boot command once the shell has had a moment to initialise.
      if (bootCommand) {
        setTimeout(() => window.strix.terminal.input(id, `${bootCommand}\r`), 400);
      }
      // Fallback: if the readiness banner is never detected (e.g. a future
      // FreeBuff redesign), seed anyway after a long grace period.
      setTimeout(() => {
        if (pendingSeedRef.current) {
          readyRef.current = true;
          flushPendingSeed();
        }
      }, 30000);
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

  // Seed / re-seed: type a new prompt into the agent. On a warm (already-ready)
  // session it types immediately; otherwise it waits for the readiness banner.
  // Bumping seed.nonce (e.g. "Ask FreeBuff" again) re-prompts the SAME session.
  useEffect(() => {
    if (!seed || seed.nonce === lastSeedNonceRef.current) return;
    if (readyRef.current) {
      lastSeedNonceRef.current = seed.nonce;
      typeSeed(seed.text);
    } else {
      pendingSeedRef.current = { nonce: seed.nonce, text: seed.text };
    }
  }, [seed?.nonce]);

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
    term.options.cursorStyle = cursorStyle ?? 'block';
    fitRef.current?.fit();
  }, [fontSize, fontFamily, cursorStyle]);

  return <div className="terminal-host" aria-label="terminal" ref={containerRef} />;
}
