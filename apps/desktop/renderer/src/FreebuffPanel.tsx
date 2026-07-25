import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from './Terminal';
import { parseFreebuffUsage, formatUsage, type FreebuffUsage } from './freebuffUsage';

// FreeBuff embedded inside the AI Assistant panel. FreeBuff is an interactive
// TUI, so we run it in a real (in-panel) terminal rather than trying to parse its
// full-screen output into chat bubbles — reliable, full keyboard, same agent.
export function FreebuffPanel({
  cwd,
  env,
  seed,
  fontSize,
  fontFamily,
  cursorStyle,
  shell,
}: {
  cwd?: string;
  env?: Record<string, string>;
  seed?: { nonce: number; text: string };
  fontSize?: number;
  fontFamily?: string;
  cursorStyle?: 'block' | 'underline' | 'bar';
  shell?: string;
}) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [restart, setRestart] = useState(0);
  // FreeBuff runs in Command Prompt on Windows, not PowerShell: the `freebuff`
  // npm shim + its interactive TUI misbehave under PowerShell's execution policy.
  // The user's normal terminal keeps its own shell.
  const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
  const fbShell = isWindows ? 'cmd.exe' : shell;
  // Latest usage scraped from FreeBuff's output (sessions/time left).
  const [usage, setUsage] = useState<FreebuffUsage | null>(null);
  // Rolling tail of recent output to scan (usage line may span chunks).
  const bufRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    window.strix.terminal
      .hasCommand('freebuff')
      .then((ok) => !cancelled && setInstalled(ok))
      .catch(() => !cancelled && setInstalled(false));
    return () => {
      cancelled = true;
    };
  }, [restart]);

  // Reset the scraped usage when the session restarts.
  useEffect(() => {
    setUsage(null);
    bufRef.current = '';
  }, [restart]);

  const onData = (chunk: string) => {
    bufRef.current = (bufRef.current + chunk).slice(-4000);
    const u = parseFreebuffUsage(bufRef.current);
    if (u) setUsage(u);
  };

  return (
    <div className="freebuff-panel">
      <div className="freebuff-head">
        <span className="freebuff-brand">
          <span className="freebuff-logo" aria-hidden>
            FB
          </span>
          FreeBuff
        </span>
        {usage?.model && <span className="freebuff-chip">{usage.model}</span>}
        {usage?.sessionLabel && <span className="freebuff-chip">{usage.sessionLabel}</span>}
        {installed === false && <span className="freebuff-chip is-warn">not installed</span>}
        <button
          type="button"
          className="freebuff-restart"
          title="Restart the FreeBuff session"
          onClick={() => setRestart((n) => n + 1)}
        >
          Restart
        </button>
      </div>
      {usage && (typeof usage.percent === 'number' || usage.resetLabel || typeof usage.left === 'number') && (
        <div
          className="freebuff-usage"
          title="Live usage, scraped from FreeBuff"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usage.percent ?? undefined}
        >
          <div className="freebuff-usage-label">{formatUsage(usage)}</div>
          {typeof usage.percent === 'number' && (
            <div className="freebuff-usage-track">
              <div
                className={`freebuff-usage-fill${usage.percent <= 15 ? ' is-low' : ''}`}
                style={{ width: `${usage.percent}%` }}
              />
            </div>
          )}
        </div>
      )}
      <div className="freebuff-term">
        {installed === null ? (
          <div className="freebuff-checking">Checking for FreeBuff…</div>
        ) : (
          <Terminal
            key={restart}
            cwd={cwd}
            env={env}
            bootCommand={installed ? 'freebuff' : 'npm install -g freebuff'}
            notice={
              installed
                ? 'Starting FreeBuff…'
                : 'FreeBuff not found — installing it (npm i -g freebuff). When it finishes, click Restart.'
            }
            seed={installed ? seed : undefined}
            fontSize={fontSize}
            fontFamily={fontFamily}
            cursorStyle={cursorStyle}
            shell={fbShell}
            onData={onData}
          />
        )}
      </div>
    </div>
  );
}
