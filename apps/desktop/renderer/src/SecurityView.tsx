import React, { useCallback, useEffect, useState } from 'react';
import type { SecurityFinding } from '../../main/securityScan';
import { FileIcon } from './FileTree';

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

const sep = (p: string) => (p.includes('\\') ? '\\' : '/');

export function SecurityView({
  rootPath,
  onOpen,
}: {
  rootPath: string | null;
  onOpen: (absPath: string) => void;
}) {
  const [findings, setFindings] = useState<SecurityFinding[] | null>(null);
  const [busy, setBusy] = useState(false);

  const scan = useCallback(async () => {
    setBusy(true);
    try {
      setFindings(await window.strix.security.scan());
    } finally {
      setBusy(false);
    }
  }, []);

  // Scan once when the view first opens.
  useEffect(() => {
    void scan();
  }, [scan]);

  const high = findings?.filter((f) => f.severity === 'high').length ?? 0;
  const med = findings?.filter((f) => f.severity === 'medium').length ?? 0;

  return (
    <div className="sec-view" aria-label="security">
      <div className="sec-toolbar">
        <button type="button" className="sec-scan-btn" disabled={busy} onClick={() => void scan()}>
          {busy ? 'Scanning…' : 'Rescan'}
        </button>
        {findings && (
          <span className="sec-summary">
            {findings.length === 0 ? 'No issues' : `${high} high · ${med} medium`}
          </span>
        )}
      </div>

      {findings && findings.length === 0 && !busy && (
        <p className="sec-clean">✓ No secrets or credentials found.</p>
      )}

      <ul className="sec-list">
        {(findings ?? []).map((f, i) => {
          const abs = rootPath
            ? `${rootPath}${sep(rootPath)}${f.path.replace(/\//g, sep(rootPath))}`
            : f.path;
          return (
            <li key={`${f.path}:${f.line}:${i}`}>
              <button
                type="button"
                className="sec-row"
                title={`${f.rule} — ${f.path}:${f.line}`}
                onClick={() => onOpen(abs)}
              >
                <span className={`sec-sev sec-${f.severity}`} aria-label={f.severity}>
                  {f.severity === 'high' ? '●' : '○'}
                </span>
                <FileIcon name={f.path} />
                <span className="sec-name">{basename(f.path)}</span>
                <span className="sec-line">:{f.line}</span>
                <span className="sec-rule">{f.rule}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
