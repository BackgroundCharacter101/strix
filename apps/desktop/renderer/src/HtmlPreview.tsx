import React, { useEffect, useState } from 'react';

// Compute the workspace-relative URL path for a file, using the same separator
// handling the rest of the app uses (Windows '\' → '/').
export function relUrlPath(root: string, filePath: string): string {
  const lp = filePath.toLowerCase();
  const lr = root.toLowerCase();
  const rel = lp.startsWith(lr) ? filePath.slice(root.length) : filePath;
  return rel.replace(/^[\\/]+/, '').replace(/\\/g, '/');
}

function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i <= 0 ? p : p.slice(0, i);
}

// Live preview of an HTML file, served by the local static host server so its
// CSS / JS / relative assets resolve exactly as in a browser. The iframe is a
// separate (127.0.0.1) origin, isolated from the IDE; sandboxed but allowed to
// run the page's own scripts/forms.
export function HtmlPreview({
  path,
  rootPath,
  reloadNonce,
}: {
  path: string;
  rootPath?: string | null;
  reloadNonce: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const root = rootPath || dirOf(path);
    window.strix.serve
      .start(root)
      .then((info) => {
        if (cancelled) return;
        setError(null);
        setSrc(`${info.url}/${relUrlPath(info.root, path)}`);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [path, rootPath]);

  if (error) {
    return (
      <div className="empty-state" role="alert">
        Couldn’t start the preview server: {error}
      </div>
    );
  }
  if (!src) {
    return (
      <div className="empty-state" role="status">
        Starting preview…
      </div>
    );
  }
  return (
    <iframe
      // Remount on reload / file switch to re-fetch from disk.
      key={`${src}:${reloadNonce}`}
      className="html-preview"
      src={src}
      title="HTML preview"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );
}
