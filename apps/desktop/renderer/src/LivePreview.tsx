import React, { useEffect, useRef, useState } from 'react';
import { detectNpmTargets } from './runTargets';

// Minimal shape of the Electron <webview> element methods we call via ref.
interface WebviewElement extends HTMLElement {
  src: string;
  reload(): void;
  loadURL(url: string): void;
  getURL(): string;
  openDevTools(): void;
}

type Phase = 'idle' | 'starting' | 'ready' | 'exited' | 'error';

// Responsive presets — width the embedded app renders at (centered when < full).
const VIEWPORTS = {
  full: { label: 'Desktop', width: '100%' },
  tablet: { label: 'Tablet', width: '768px' },
  mobile: { label: 'Mobile', width: '375px' },
} as const;
type Viewport = keyof typeof VIEWPORTS;

// The Live Preview surface: runs the project's dev server (or the static host for
// plain sites) and embeds the running app in a <webview>, live-updating via the
// dev server's own HMR. Rendered as a dedicated editor-area tab.
export function LivePreview({
  workspaceKey,
  onClose,
}: {
  workspaceKey: string | null;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [log, setLog] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [viewport, setViewport] = useState<Viewport>('full');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const webviewRef = useRef<WebviewElement | null>(null);
  const staticRef = useRef(false); // true when using the static-host fallback

  // Detect the dev command + start. Static fallback (serve.start) for a project
  // with no dev-ish npm script.
  const start = async () => {
    if (!workspaceKey) return;
    setPhase('starting');
    setLog('');
    setUrl(null);
    setExitCode(null);
    let cmd: string | null = null;
    try {
      const pkg = await window.strix.fs.read(`${workspaceKey}/package.json`);
      const targets = detectNpmTargets(pkg);
      const dev = targets.find((t) => ['dev', 'start', 'serve', 'preview', 'watch'].includes(t.label));
      cmd = dev?.command ?? null;
    } catch {
      cmd = null; // no package.json → static site
    }

    if (cmd) {
      staticRef.current = false;
      setCommand(cmd);
      await window.strix.preview.start(cmd); // url arrives via onUrl
    } else {
      // Plain HTML/JS: host the folder and reload the webview on file save.
      staticRef.current = true;
      setCommand('static host');
      try {
        const info = await window.strix.serve.start(workspaceKey);
        setUrl(info.url);
        setPhase('ready');
      } catch (e) {
        setLog(String(e instanceof Error ? e.message : e));
        setPhase('error');
      }
    }
  };

  useEffect(() => {
    void start();
    const offUrl = window.strix.preview.onUrl((u) => {
      setUrl(u);
      setPhase('ready');
    });
    const offLog = window.strix.preview.onLog((chunk) => setLog((l) => (l + chunk).slice(-20000)));
    const offExit = window.strix.preview.onExit((code) => {
      setExitCode(code);
      setPhase('exited');
    });
    // Static fallback: reload the embedded page when files change (HMR does this
    // automatically for dev-server apps, so only the static path needs it).
    const offChanged = window.strix.fs.onChanged(() => {
      if (staticRef.current) webviewRef.current?.reload();
    });
    return () => {
      offUrl();
      offLog();
      offExit();
      offChanged();
      if (!staticRef.current) void window.strix.preview.stop();
    };
  }, [workspaceKey]);

  const reload = () => webviewRef.current?.reload();
  const openExternal = () => url && window.strix.win.openExternal(url);
  const stop = () => {
    void window.strix.preview.stop();
    setPhase('exited');
  };

  if (!workspaceKey) {
    return (
      <div className="live-preview">
        <div className="live-empty">Open a folder to preview it live.</div>
      </div>
    );
  }

  return (
    <div className="live-preview">
      <div className="live-toolbar">
        <span className="live-title">◐ Live Preview</span>
        <button type="button" className="live-btn" onClick={reload} disabled={!url} title="Reload">
          ↻
        </button>
        <span className="live-address" title={url ?? command ?? ''}>
          {url ?? (phase === 'starting' ? `Starting ${command ?? ''}…` : 'Not running')}
        </span>
        <span className="live-viewports">
          {(Object.keys(VIEWPORTS) as Viewport[]).map((v) => (
            <button
              type="button"
              key={v}
              className={`live-btn${viewport === v ? ' is-active' : ''}`}
              onClick={() => setViewport(v)}
              title={VIEWPORTS[v].label}
            >
              {VIEWPORTS[v].label}
            </button>
          ))}
        </span>
        <button type="button" className="live-btn" onClick={openExternal} disabled={!url} title="Open in browser">
          ⇗
        </button>
        <button
          type="button"
          className="live-btn"
          onClick={() => webviewRef.current?.openDevTools()}
          disabled={!url}
          title="Preview DevTools"
        >
          ⚙
        </button>
        <button type="button" className="live-btn" onClick={() => setShowLog((s) => !s)} title="Toggle logs">
          Logs
        </button>
        <button type="button" className="live-btn" onClick={stop} title="Stop the dev server">
          Stop
        </button>
        <button type="button" className="live-btn live-close" onClick={onClose} aria-label="Close Live Preview">
          ✕
        </button>
      </div>

      <div className="live-body">
        {url ? (
          <div className="live-stage" data-viewport={viewport}>
            <webview
              ref={(el) => {
                webviewRef.current = el as WebviewElement | null;
                // Allow the guest app's target=_blank/window.open (routed to the
                // OS browser by the main-process window-open handler).
                el?.setAttribute('allowpopups', 'true');
              }}
              src={url}
              className="live-webview"
              style={{ width: VIEWPORTS[viewport].width }}
            />
          </div>
        ) : phase === 'exited' ? (
          <div className="live-status">
            <p>Dev server stopped{exitCode != null ? ` (exit ${exitCode})` : ''}.</p>
            <button type="button" className="live-btn" onClick={() => void start()}>
              Restart
            </button>
          </div>
        ) : phase === 'error' ? (
          <div className="live-status">
            <p>Couldn’t start the preview.</p>
            <button type="button" className="live-btn" onClick={() => void start()}>
              Retry
            </button>
          </div>
        ) : (
          <div className="live-status">
            <p>Starting {command ?? 'the dev server'}… waiting for its URL.</p>
          </div>
        )}
      </div>

      {showLog && (
        <pre className="live-log" aria-label="Preview logs">
          {log || '(no output yet)'}
        </pre>
      )}
    </div>
  );
}
