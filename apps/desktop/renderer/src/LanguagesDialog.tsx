import React, { useEffect, useState } from 'react';
import { LANGUAGES } from './languages';

export function LanguagesDialog({ onClose }: { onClose: () => void }) {
  // server command → installed?  (undefined = still checking)
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      LANGUAGES.map(async (l) => [l.server, await window.strix.lsp.hasServer(l.server)] as const),
    ).then((pairs) => {
      if (!cancelled) setStatus(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(text);
    window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
  };

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="dialog languages-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">Languages &amp; Extensions</h2>
        <p className="languages-note">
          Strix uses native language servers instead of a plugin marketplace (safer —
          no third-party code is downloaded or executed). Syntax highlighting is built
          in for all of these; for IntelliSense and error-checking, install the language
          server below — it just needs to be on your PATH.
        </p>
        <ul className="languages-list" aria-label="languages">
          {LANGUAGES.map((lang) => {
            const installed = status[lang.server];
            return (
              <li key={lang.label} className="languages-row">
                <div className="languages-head">
                  <span className="languages-label">{lang.label}</span>
                  <span className="languages-ext">{lang.extensions.join(' ')}</span>
                  <span
                    className={`languages-status ${installed ? 'is-ok' : installed === false ? 'is-missing' : ''}`}
                  >
                    {installed === undefined ? '…' : installed ? '✓ installed' : '✗ not found'}
                  </span>
                </div>
                {installed === false && (
                  <div className="languages-install">
                    <code>{lang.install}</code>
                    <button type="button" className="ai-ghost-btn" onClick={() => copy(lang.install)}>
                      {copied === lang.install ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
