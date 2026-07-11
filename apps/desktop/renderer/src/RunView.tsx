import React, { useEffect, useState } from 'react';
import { detectNpmTargets, detectPythonTargets, type RunTarget } from './runTargets';
import { PlayIcon } from './icons';
import type { StaticServerInfo } from '../../main/bridge';
import { showToast } from './toast';

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
  onOpenLivePreview,
}: {
  rootPath: string | null;
  activeFilePath: string | null;
  onRun: (command: string, label: string) => void;
  onOpenLivePreview: () => void;
}) {
  const [targets, setTargets] = useState<RunTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [server, setServer] = useState<StaticServerInfo | null>(null);

  // Reflect an already-running host server (e.g. started by the HTML preview).
  useEffect(() => {
    let cancelled = false;
    void window.strix.serve.info().then((info) => {
      if (!cancelled) setServer(info);
    });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const hostFolder = async () => {
    if (!rootPath) return;
    try {
      const info = await window.strix.serve.start(rootPath);
      setServer(info);
      window.strix.win.openExternal(info.url);
      showToast(`Hosting at ${info.url}`, 'success', 3000);
    } catch (e) {
      showToast(`Could not host: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const stopHost = async () => {
    await window.strix.serve.stop();
    setServer(null);
    showToast('Stopped local server', 'info', 2000);
  };

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
      <div className="scm-group-head">
        <span>Live preview</span>
      </div>
      <ul className="run-list">
        <li className="run-row">
          <button
            type="button"
            className="run-target"
            title="Run the dev server and preview the live app inside Strix"
            onClick={onOpenLivePreview}
          >
            <PlayIcon size={13} />
            <span className="run-label">Open Live Preview</span>
            <span className="run-cmd">runs your dev server, embeds the app</span>
          </button>
        </li>
      </ul>
      <div className="scm-group-head">
        <span>Local server</span>
      </div>
      <ul className="run-list">
        <li className="run-row">
          <button
            type="button"
            className="run-target"
            title="Serve this folder over http://127.0.0.1 and open it in your browser"
            onClick={() => void hostFolder()}
          >
            <PlayIcon size={13} />
            <span className="run-label">Host this folder</span>
            <span className="run-cmd">static · 127.0.0.1</span>
          </button>
        </li>
        {server && (
          <li className="run-row run-server-status">
            <button
              type="button"
              className="run-server-url"
              title="Open in browser"
              onClick={() => window.strix.win.openExternal(server.url)}
            >
              ● {server.url}
            </button>
            <button type="button" className="run-server-stop" onClick={() => void stopHost()}>
              Stop
            </button>
          </li>
        )}
      </ul>
      {loading && targets.length === 0 ? (
        <p className="muted">Scanning…</p>
      ) : targets.length === 0 ? (
        <p className="muted">
          No npm or Python targets found. Add scripts to package.json or open a Python file —
          or use “Host this folder” above for static sites.
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
