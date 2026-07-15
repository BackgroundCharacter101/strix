import React, { useEffect, useRef, useState } from 'react';
import type { UpdateInfo } from '../../main/bridge';

// Self-contained live-update UI. On mount it quietly checks the update server;
// if a newer build exists a banner offers it. The user clicks "Update now" →
// download + verify (progress) → "Update ready — Restart to apply" → the
// installer runs silently and relaunches. Also handles Help → "Check for
// Updates…" (menu command id `help.updates`), which surfaces "up to date" and
// errors that the silent launch check swallows.
type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'uptodate'; current: string }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'downloading'; info: UpdateInfo; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

export function UpdateBanner() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  // Whether the in-flight check was user-initiated — auto (launch) checks stay
  // silent on "no update"/error so a stopped dev server never nags on startup.
  const manualRef = useRef(false);

  const runCheck = async (manual: boolean) => {
    manualRef.current = manual;
    if (manual) setState({ kind: 'checking' });
    try {
      const res = await window.strix.update.check();
      if (res.error) {
        // A failed check must NOT look like "up to date".
        if (manual) setState({ kind: 'error', message: `Couldn't reach the update server — ${res.error}` });
        return;
      }
      if (res.available && res.manifest) setState({ kind: 'available', info: res.manifest });
      else if (manual) {
        setState({ kind: 'uptodate', current: res.current });
        window.setTimeout(() => setState((s) => (s.kind === 'uptodate' ? { kind: 'idle' } : s)), 3500);
      }
    } catch (e) {
      if (manual) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    void runCheck(false); // launch check
    const offAvail = window.strix.update.onAvailable((info) =>
      setState((s) => (s.kind === 'idle' || s.kind === 'uptodate' ? { kind: 'available', info } : s)),
    );
    const offProg = window.strix.update.onProgress((p) =>
      setState((s) => (s.kind === 'downloading' ? { ...s, percent: p.percent } : s)),
    );
    const offReady = window.strix.update.onReady((p) => setState({ kind: 'ready', version: p.version }));
    const offErr = window.strix.update.onError((p) => {
      // Only surface download/apply errors (user already engaged). A silent
      // launch-check failure leaves us in idle → stay quiet.
      setState((s) => (s.kind === 'downloading' || manualRef.current ? { kind: 'error', message: p.error } : s));
    });
    const offMenu = window.strix.menu.onCommand((id) => {
      if (id === 'help.updates') void runCheck(true);
    });
    return () => {
      offAvail();
      offProg();
      offReady();
      offErr();
      offMenu();
    };
  }, []);

  const startDownload = (info: UpdateInfo) => {
    setState({ kind: 'downloading', info, percent: 0 });
    void window.strix.update.download(info);
  };

  if (state.kind === 'idle') return null;

  return (
    <div className="update-banner" role="status" aria-live="polite" data-kind={state.kind}>
      {state.kind === 'checking' && <span className="update-msg">Checking for updates…</span>}

      {state.kind === 'uptodate' && (
        <span className="update-msg">Strix is up to date (v{state.current}).</span>
      )}

      {state.kind === 'available' && (
        <>
          <span className="update-msg">
            Update <strong>v{state.info.version}</strong> available
            {state.info.notes ? <span className="update-notes"> — {state.info.notes}</span> : null}
          </span>
          <span className="update-actions">
            <button type="button" className="update-btn update-btn-primary" onClick={() => startDownload(state.info)}>
              Update now
            </button>
            <button type="button" className="update-btn" aria-label="Dismiss" onClick={() => setState({ kind: 'idle' })}>
              Later
            </button>
          </span>
        </>
      )}

      {state.kind === 'downloading' && (
        <>
          <span className="update-msg">Downloading update… {state.percent}%</span>
          <span className="update-progress" aria-hidden="true">
            <span className="update-progress-fill" style={{ width: `${state.percent}%` }} />
          </span>
        </>
      )}

      {state.kind === 'ready' && (
        <>
          <span className="update-msg">
            Update <strong>v{state.version}</strong> ready — restart to apply
          </span>
          <span className="update-actions">
            <button
              type="button"
              className="update-btn update-btn-primary"
              onClick={() => void window.strix.update.apply()}
            >
              Restart now
            </button>
          </span>
        </>
      )}

      {state.kind === 'error' && (
        <>
          <span className="update-msg update-msg-error">Update failed: {state.message}</span>
          <span className="update-actions">
            <button type="button" className="update-btn" onClick={() => setState({ kind: 'idle' })}>
              Dismiss
            </button>
          </span>
        </>
      )}
    </div>
  );
}
