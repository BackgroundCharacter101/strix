import React, { useEffect, useState } from 'react';
import { hexDump, bytesFromBase64, formatSize } from './hex';

const MAX_ROWS = 4096; // 64 KB rendered at a time — fast and readable.

export function HexViewer({ path }: { path: string }) {
  const [dump, setDump] = useState<string>('');
  const [meta, setMeta] = useState<{ size: number; truncated: boolean; shown: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDump('');
    setError(null);
    window.strix.fs
      .readBytes(path)
      .then(({ base64, size, truncated }) => {
        if (cancelled) return;
        const bytes = bytesFromBase64(base64);
        const shown = Math.min(bytes.length, MAX_ROWS * 16);
        setDump(hexDump(bytes, MAX_ROWS));
        setMeta({ size, truncated: truncated || bytes.length > MAX_ROWS * 16, shown });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (error) {
    return (
      <div className="empty-state" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="hex-view" aria-label="hex view">
      {meta && (
        <div className="hex-meta">
          {formatSize(meta.size)}
          {meta.truncated && ` — showing first ${formatSize(meta.shown)}`}
        </div>
      )}
      <pre className="hex-dump">{dump}</pre>
    </div>
  );
}
