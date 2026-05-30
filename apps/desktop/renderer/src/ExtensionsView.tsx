import React, { useCallback, useEffect, useState } from 'react';
import { LANGUAGES } from './languages';
import { showToast } from './toast';

type State = 'checking' | 'installed' | 'missing' | 'installing' | 'uninstalling' | 'failed';

export function ExtensionsView() {
  const [state, setState] = useState<Record<string, State>>({});
  const [output, setOutput] = useState<Record<string, string>>({});

  const check = useCallback(async () => {
    const pairs = await Promise.all(
      LANGUAGES.map(
        async (l) => [l.id, (await window.strix.lsp.hasServer(l.server)) ? 'installed' : 'missing'] as const,
      ),
    );
    setState((prev) => {
      const next = { ...prev };
      for (const [id, s] of pairs) {
        if (next[id] !== 'installing' && next[id] !== 'uninstalling') next[id] = s;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const install = async (id: string) => {
    setState((s) => ({ ...s, [id]: 'installing' }));
    setOutput((o) => ({ ...o, [id]: '' }));
    const res = await window.strix.lsp.installServer(id);
    setOutput((o) => ({ ...o, [id]: res.output }));
    // A successful install command means the server is available (it may need a
    // fresh shell to appear on PATH, so trust the exit code).
    setState((s) => ({ ...s, [id]: res.ok ? 'installed' : 'failed' }));
    const label = LANGUAGES.find((l) => l.id === id)?.label ?? id;
    showToast(
      res.ok ? `${label} language server installed` : `${label} install failed`,
      res.ok ? 'success' : 'error',
      res.ok ? 4000 : 8000,
    );
  };

  const uninstall = async (id: string) => {
    const lang = LANGUAGES.find((l) => l.id === id);
    if (!window.confirm(`Uninstall the ${lang?.label ?? id} language server?`)) return;
    setState((s) => ({ ...s, [id]: 'uninstalling' }));
    setOutput((o) => ({ ...o, [id]: '' }));
    const res = await window.strix.lsp.uninstallServer(id);
    setOutput((o) => ({ ...o, [id]: res.output }));
    setState((s) => ({ ...s, [id]: res.ok ? 'missing' : 'installed' }));
    showToast(
      res.ok ? `${lang?.label ?? id} language server uninstalled` : `${lang?.label ?? id} uninstall failed`,
      res.ok ? 'success' : 'error',
      res.ok ? 4000 : 8000,
    );
  };

  return (
    <div className="ext-view" aria-label="extensions">
      <p className="ext-note">
        Strix uses native language servers (no plugin marketplace — nothing
        third-party is downloaded or run silently). Install the ones your team needs.
      </p>
      <ul className="ext-list">
        {LANGUAGES.map((lang) => {
          const s = state[lang.id] ?? 'checking';
          return (
            <li key={lang.id} className="ext-row">
              <div className="ext-head">
                <span className="ext-label">{lang.label}</span>
                <span className="ext-exts">{lang.extensions.join(' ')}</span>
              </div>
              <div className="ext-actions">
                {s === 'installed' && (
                  <>
                    <span className="ext-status is-ok">✓ Installed</span>
                    {lang.uninstallable && (
                      <button
                        type="button"
                        className="ext-uninstall"
                        onClick={() => void uninstall(lang.id)}
                      >
                        Uninstall
                      </button>
                    )}
                  </>
                )}
                {s === 'checking' && <span className="ext-status">…</span>}
                {s === 'installing' && <span className="ext-status is-busy">Installing…</span>}
                {s === 'uninstalling' && <span className="ext-status is-busy">Uninstalling…</span>}
                {(s === 'missing' || s === 'failed') &&
                  (lang.installable ? (
                    <button type="button" className="ext-install" onClick={() => void install(lang.id)}>
                      Install
                    </button>
                  ) : (
                    <span className="ext-status is-missing">Manual install</span>
                  ))}
                {s === 'failed' && <span className="ext-status is-missing">Failed</span>}
              </div>
              {(s === 'missing' || s === 'failed' || !lang.installable) && (
                <code className="ext-cmd" title="Install command">
                  {lang.install}
                </code>
              )}
              {output[lang.id] && <pre className="ext-output">{output[lang.id]}</pre>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
