import React, { useEffect, useState } from 'react';
import { Terminal } from './Terminal';

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

  return (
    <div className="freebuff-panel">
      <div className="freebuff-bar">
        <span className="freebuff-badge">
          FreeBuff{installed === false ? ' — not installed' : ''}
        </span>
        <button
          type="button"
          className="ai-ghost-btn"
          title="Restart the FreeBuff session"
          onClick={() => setRestart((n) => n + 1)}
        >
          Restart
        </button>
      </div>
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
            shell={shell}
          />
        )}
      </div>
    </div>
  );
}
