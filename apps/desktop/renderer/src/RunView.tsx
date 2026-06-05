import React, { useEffect, useState } from 'react';
import { detectNpmTargets, detectPythonTargets, type RunTarget } from './runTargets';
import { PlayIcon } from './icons';

interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

function sep(p: string): string {
  return p.includes('\\') ? '\\' : '/';
}

// The Run & Serve panel: detects runnable targets in the workspace (npm scripts,
// Python entrypoints) and runs the chosen one in the integrated terminal.
export function RunView({
  rootPath,
  activeFilePath,
  onRun,
}: {
  rootPath: string | null;
  activeFilePath: string | null;
  onRun: (command: string, label: string) => void;
}) {
  const [targets, setTargets] = useState<RunTarget[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!rootPath) {
      setTargets([]);
      return;
    }
    setLoading(true);
    void (async () => {
      const out: RunTarget[] = [];
      // npm scripts from the root package.json.
      try {
        const pkg = await window.strix.fs.read(`${rootPath}${sep(rootPath)}package.json`);
        out.push(...detectNpmTargets(pkg));
      } catch {
        /* no package.json */
      }
      // Python entrypoints from the root's top-level files.
      try {
        const tree = (await window.strix.fs.tree(rootPath)) as TreeNode;
        const topFiles = (tree.children ?? [])
          .filter((n) => n.type === 'file')
          .map((n) => n.name);
        out.push(...detectPythonTargets(topFiles, activeFilePath));
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        setTargets(out);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rootPath, activeFilePath]);

  if (!rootPath) return <p className="muted">Open a folder to run it.</p>;

  const npm = targets.filter((t) => t.kind === 'npm');
  const py = targets.filter((t) => t.kind === 'python');

  const group = (title: string, items: RunTarget[]) =>
    items.length > 0 && (
      <>
        <div className="scm-group-head">
          <span>{title}</span>
          <span className="scm-count">{items.length}</span>
        </div>
        <ul className="run-list">
          {items.map((t) => (
            <li key={t.id} className="run-row">
              <button
                type="button"
                className="run-target"
                title={t.command}
                onClick={() => onRun(t.command, t.label)}
              >
                <PlayIcon size={13} />
                <span className="run-label">{t.label}</span>
                <span className="run-cmd">{t.command}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <div className="run-view" aria-label="run and serve">
      {loading && targets.length === 0 ? (
        <p className="muted">Scanning…</p>
      ) : targets.length === 0 ? (
        <p className="muted">
          No run targets found. Add scripts to package.json, or open a Python file.
        </p>
      ) : (
        <>
          {group('npm scripts', npm)}
          {group('Python', py)}
        </>
      )}
    </div>
  );
}
