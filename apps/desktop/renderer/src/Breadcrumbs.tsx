import React from 'react';
import { FileIcon } from './FileTree';

// Split an absolute file path into workspace-relative segments, with the
// workspace folder name as the first crumb (matches VS Code's breadcrumbs).
export function relativeSegments(rootPath: string | null, path: string): string[] {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const np = norm(path);
  if (!rootPath) return np.split('/').filter(Boolean);
  const nr = norm(rootPath);
  const rootName = nr.split('/').pop() ?? '';
  if (np.startsWith(nr)) {
    const rel = np.slice(nr.length).split('/').filter(Boolean);
    return [rootName, ...rel];
  }
  return np.split('/').filter(Boolean);
}

export function Breadcrumbs({ rootPath, path }: { rootPath: string | null; path: string }) {
  const segments = relativeSegments(rootPath, path);
  const lastIndex = segments.length - 1;

  return (
    <nav className="breadcrumbs" aria-label="breadcrumbs">
      {segments.map((seg, i) => (
        <span key={`${seg}-${i}`} className="breadcrumb-seg" data-leaf={i === lastIndex}>
          {i > 0 && <span className="breadcrumb-sep">›</span>}
          {i === lastIndex && <FileIcon name={seg} />}
          {seg}
        </span>
      ))}
    </nav>
  );
}
