import React, { useEffect, useMemo, useState } from 'react';
import type { GithubRepo } from '../../main/bridge';
import { showToast } from './toast';

// Clone dialog with optional GitHub account connection: connect a token once,
// then pick/search your repos instead of pasting a URL. A manual URL field
// stays available for any other repo.
const REG_URL = 'https://github.com/settings/applications/new';

export function CloneDialog({
  clientId,
  onSetClientId,
  onClone,
  onCancel,
}: {
  clientId: string;
  onSetClientId: (id: string) => void;
  onClone: (url: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState('');
  const [login, setLogin] = useState<string | null>(null);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [query, setQuery] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [device, setDevice] = useState<{ userCode: string; uri: string } | null>(null);
  const [setup, setSetup] = useState(false);
  const [clientInput, setClientInput] = useState('');

  const signIn = async (idArg?: string) => {
    if (busy) return;
    const id = (idArg ?? clientId).trim();
    if (!id) {
      // First-time: no OAuth App yet. Open the registration page + let the user
      // paste the resulting Client ID right here.
      setSetup(true);
      void window.strix.win.openExternal(REG_URL);
      return;
    }
    setBusy(true);
    try {
      const d = await window.strix.github.deviceStart(id);
      setDevice({ userCode: d.userCode, uri: d.verificationUri });
      await window.strix.win.openExternal(d.verificationUri);
      const res = await window.strix.github.deviceWait(id, d.deviceCode, d.interval);
      if (res.ok) {
        setLogin(res.login ?? null);
        await loadRepos();
        showToast(`Connected to GitHub as ${res.login}`, 'success');
      } else {
        showToast(res.error ?? 'Sign-in failed.', 'error', 7000);
      }
    } catch (e) {
      showToast(`GitHub: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000);
    } finally {
      setBusy(false);
      setDevice(null);
    }
  };

  const saveAndSignIn = () => {
    const id = clientInput.trim();
    if (!id) return;
    onSetClientId(id);
    setSetup(false);
    void signIn(id);
  };

  const loadRepos = async () => {
    try {
      setRepos(await window.strix.github.repos());
    } catch (e) {
      showToast(`GitHub: ${e instanceof Error ? e.message : String(e)}`, 'error', 6000);
    }
  };

  useEffect(() => {
    void (async () => {
      const u = await window.strix.github.user();
      setLogin(u?.login ?? null);
      if (u) await loadRepos();
      setLoading(false);
    })();
  }, []);

  const connect = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      const res = await window.strix.github.connect(token.trim());
      if (res.ok) {
        setLogin(res.login ?? null);
        setToken('');
        await loadRepos();
        showToast(`Connected to GitHub as ${res.login}`, 'success');
      } else {
        showToast(res.error ?? 'Could not connect to GitHub.', 'error', 7000);
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await window.strix.github.disconnect();
    setLogin(null);
    setRepos([]);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) => r.fullName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
    );
  }, [repos, query]);

  return (
    <div className="palette-overlay" onMouseDown={onCancel}>
      <div
        className="dialog clone-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="strix-clone-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog-title" id="strix-clone-title">
          Clone repository
        </h2>

        {login ? (
          <>
            <div className="clone-account">
              <span>
                Connected as <strong>{login}</strong>
              </span>
              <button type="button" className="scm-link" onClick={() => void disconnect()}>
                Disconnect
              </button>
            </div>
            <input
              className="dialog-input"
              aria-label="Search your repositories"
              placeholder="Search your repositories…"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className="clone-repos" aria-label="Your repositories">
              {filtered.length === 0 ? (
                <li className="clone-empty">{repos.length ? 'No matches.' : 'No repositories.'}</li>
              ) : (
                filtered.map((r) => (
                  <li key={r.fullName}>
                    <button
                      type="button"
                      className="clone-repo"
                      onClick={() => onClone(r.cloneUrl)}
                      title={r.cloneUrl}
                    >
                      <span className="clone-repo-name">
                        {r.fullName}
                        {r.private && <span className="clone-badge">private</span>}
                      </span>
                      {r.description && <span className="clone-repo-desc">{r.description}</span>}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        ) : (
          <div className="clone-connect">
            {setup ? (
              <>
                <p className="clone-hint">
                  One-time setup. A GitHub page opened to <strong>register an OAuth App</strong>:
                  <br />
                  1. Name it (e.g. Strix), set any homepage URL, click <strong>Register</strong>.
                  <br />
                  2. On the app page, tick <strong>Enable Device Flow</strong>.
                  <br />
                  3. Copy the <strong>Client ID</strong> and paste it below.
                </p>
                <input
                  className="dialog-input"
                  aria-label="GitHub client ID"
                  placeholder="Client ID (e.g. Iv1.xxxx or Ov23xxxx)"
                  value={clientInput}
                  autoFocus
                  onChange={(e) => setClientInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveAndSignIn()}
                />
                <button
                  type="button"
                  className="clone-connect-btn"
                  disabled={clientInput.trim().length === 0}
                  onClick={saveAndSignIn}
                >
                  Save &amp; sign in
                </button>
                <button
                  type="button"
                  className="scm-link clone-token-toggle"
                  onClick={() => void window.strix.win.openExternal(REG_URL)}
                >
                  Reopen the registration page
                </button>
              </>
            ) : device ? (
              <p className="clone-hint">
                In the browser, enter this code: <strong className="clone-code">{device.userCode}</strong>
                <br />
                Waiting for authorization… (a tab opened at {device.uri})
              </p>
            ) : (
              <p className="clone-hint">
                {loading
                  ? 'Checking GitHub connection…'
                  : 'Sign in to pick your repositories by name and clone private repos.'}
              </p>
            )}
            {!setup && (
              <button
                type="button"
                className="clone-connect-btn"
                disabled={busy || loading}
                onClick={() => void signIn()}
              >
                {busy ? 'Waiting for GitHub…' : 'Sign in with GitHub'}
              </button>
            )}
            {!busy && !setup && (
              <button
                type="button"
                className="scm-link clone-token-toggle"
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? 'Hide token option' : 'Use a token instead'}
              </button>
            )}
            {showToken && !busy && !setup && (
              <>
                <input
                  className="dialog-input"
                  type="password"
                  aria-label="GitHub token"
                  placeholder="GitHub Personal Access Token (repo scope)"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void connect()}
                />
                <button
                  type="button"
                  className="clone-connect-btn"
                  disabled={token.trim().length === 0}
                  onClick={() => void connect()}
                >
                  Connect with token
                </button>
              </>
            )}
          </div>
        )}

        <div className="clone-or">or clone by URL</div>
        <input
          className="dialog-input"
          aria-label="Repository URL"
          placeholder="https://github.com/owner/repo.git"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && url.trim()) onClone(url.trim());
            else if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="dialog-actions">
          <button type="button" className="ai-ghost-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" disabled={url.trim().length === 0} onClick={() => onClone(url.trim())}>
            Clone URL
          </button>
        </div>
      </div>
    </div>
  );
}
