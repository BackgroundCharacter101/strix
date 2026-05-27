import React, { useCallback, useEffect, useState } from 'react';
import type { FileNode } from '../main/fs';
import { FileTree } from './src/FileTree';
import { FileViewer } from './src/FileViewer';
import { EditorTabs } from './src/EditorTabs';
import { Breadcrumbs, relativeSegments } from './src/Breadcrumbs';
import { Palette, type PaletteItem } from './src/Palette';
import { PromptDialog } from './src/PromptDialog';
import { AiPanel } from './src/AiPanel';
import { StatusBar } from './src/StatusBar';
import { TerminalTabs } from './src/TerminalTabs';
import { useEditorTabs } from './src/useEditorTabs';
import { useResizable } from './src/useResizable';
import { FilesIcon, SparkleIcon, TerminalIcon } from './src/icons';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [showSidebar, setShowSidebar] = useState(true);
  const [showAi, setShowAi] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [palette, setPalette] = useState<null | 'files' | 'commands'>(null);
  const [fileItems, setFileItems] = useState<PaletteItem[]>([]);
  const [problems, setProblems] = useState({ errors: 0, warnings: 0 });
  const [cloneOpen, setCloneOpen] = useState(false);
  const tabs = useEditorTabs();

  const openFolder = useCallback(async () => {
    const dir = await window.strix.workspace.open();
    if (dir) setRoot(dir);
  }, []);

  const cloneRepo = useCallback(async (url: string) => {
    setCloneOpen(false);
    try {
      const dir = await window.strix.workspace.clone(url);
      if (dir) setRoot(dir);
    } catch (e) {
      window.alert(`Clone failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Load and flatten the workspace tree into Quick Open entries.
  const openQuickFiles = useCallback(async () => {
    if (!root) return;
    const tree = await window.strix.fs.tree(root);
    const items: PaletteItem[] = [];
    const walk = (n: FileNode) => {
      if (n.type === 'file') {
        const segs = relativeSegments(root, n.path);
        items.push({ id: n.path, label: n.name, detail: segs.slice(0, -1).join('/'), icon: n.name });
      } else {
        n.children?.forEach(walk);
      }
    };
    walk(tree);
    setFileItems(items);
    setPalette('files');
  }, [root]);

  const sidebar = useResizable(260, { axis: 'x', direction: 1, min: 150, max: 500 });
  const aiPanel = useResizable(340, { axis: 'x', direction: -1, min: 220, max: 600 });
  const terminal = useResizable(260, { axis: 'y', direction: -1, min: 120, max: 600 });

  useEffect(() => {
    window.strix.workspace.root().then(setRoot);
  }, []);

  // Global keyboard shortcuts (VS Code-style).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          void tabs.active?.save();
          break;
        case 'b':
          e.preventDefault();
          setShowSidebar((v) => !v);
          break;
        case '`':
          e.preventDefault();
          setShowTerminal((v) => !v);
          break;
        case 'w':
          if (tabs.activePath) {
            e.preventDefault();
            tabs.close(tabs.activePath);
          }
          break;
        case 'p':
          e.preventDefault();
          if (e.shiftKey) {
            setPalette('commands');
          } else {
            void openQuickFiles();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabs, openQuickFiles]);

  const commands: { id: string; label: string; detail: string; run: () => void }[] = [
    { id: 'workspace.openFolder', label: 'File: Open Folder…', detail: '', run: () => void openFolder() },
    { id: 'workspace.clone', label: 'Git: Clone Repository…', detail: '', run: () => setCloneOpen(true) },
    { id: 'view.explorer', label: 'View: Toggle Explorer', detail: 'Ctrl+B', run: () => setShowSidebar((v) => !v) },
    { id: 'view.ai', label: 'View: Toggle AI Panel', detail: '', run: () => setShowAi((v) => !v) },
    { id: 'view.terminal', label: 'View: Toggle Terminal', detail: 'Ctrl+`', run: () => setShowTerminal((v) => !v) },
    { id: 'file.save', label: 'File: Save', detail: 'Ctrl+S', run: () => void tabs.active?.save() },
    {
      id: 'view.closeEditor',
      label: 'View: Close Editor',
      detail: 'Ctrl+W',
      run: () => tabs.activePath && tabs.close(tabs.activePath),
    },
    { id: 'file.quickOpen', label: 'Go to File…', detail: 'Ctrl+P', run: () => void openQuickFiles() },
  ];

  return (
    <div className="app">
      <header className="titlebar">
        <span className="app-title">Strix IDE</span>
      </header>
      <div className="app-body">
        <nav className="activity-bar" aria-label="panels">
          <button
            type="button"
            aria-label="Toggle files"
            aria-pressed={showSidebar}
            title="Explorer"
            onClick={() => setShowSidebar((v) => !v)}
          >
            <FilesIcon />
          </button>
          <button
            type="button"
            aria-label="Toggle AI"
            aria-pressed={showAi}
            title="AI assistant"
            onClick={() => setShowAi((v) => !v)}
          >
            <SparkleIcon />
          </button>
          <button
            type="button"
            aria-label="Toggle terminal"
            aria-pressed={showTerminal}
            title="Terminal"
            onClick={() => setShowTerminal((v) => !v)}
          >
            <TerminalIcon />
          </button>
        </nav>
        <div className="app-main">
          <div className="workbench">
            {showSidebar && (
              <>
                <aside className="sidebar" style={{ width: sidebar.size }}>
                  <div className="sidebar-header">Explorer</div>
                  {root ? (
                    <FileTree
                      key={root}
                      rootPath={root}
                      activePath={tabs.activePath}
                      onSelectFile={(node) => tabs.open(node.path)}
                    />
                  ) : (
                    <p className="muted">Opening workspace…</p>
                  )}
                </aside>
                <div className="resizer resizer-x" onPointerDown={sidebar.onPointerDown} />
              </>
            )}
            <main className="editor-pane">
              <EditorTabs tabs={tabs} />
              {tabs.activePath && <Breadcrumbs rootPath={root} path={tabs.activePath} />}
              <FileViewer
                path={tabs.activePath}
                buffer={tabs.active}
                onCursorChange={setCursor}
                onMarkersChange={setProblems}
                onOpenFolder={openFolder}
                onCloneRepo={() => setCloneOpen(true)}
              />
            </main>
            {showAi && (
              <>
                <div className="resizer resizer-x" onPointerDown={aiPanel.onPointerDown} />
                <aside className="ai-pane" style={{ width: aiPanel.size }}>
                  <AiPanel
                    filePath={tabs.activePath}
                    fileContent={tabs.active?.draft ?? ''}
                    onApplyEdit={(content) => tabs.active?.setDraft(content)}
                  />
                </aside>
              </>
            )}
          </div>
          {showTerminal && (
            <>
              <div className="resizer resizer-y" onPointerDown={terminal.onPointerDown} />
              <section className="panel" style={{ height: terminal.size }}>
                <TerminalTabs />
              </section>
            </>
          )}
        </div>
      </div>
      <StatusBar
        rootPath={root}
        path={tabs.activePath}
        dirty={tabs.active?.dirty ?? false}
        cursor={cursor}
        content={tabs.active?.draft ?? ''}
        problems={tabs.activePath ? problems : { errors: 0, warnings: 0 }}
      />
      {palette === 'files' && (
        <Palette
          items={fileItems}
          placeholder="Search files by name…"
          onSelect={(item) => {
            tabs.open(item.id);
            setPalette(null);
          }}
          onClose={() => setPalette(null)}
        />
      )}
      {palette === 'commands' && (
        <Palette
          items={commands.map((c) => ({ id: c.id, label: c.label, detail: c.detail }))}
          placeholder="Type a command…"
          onSelect={(item) => {
            setPalette(null);
            commands.find((c) => c.id === item.id)?.run();
          }}
          onClose={() => setPalette(null)}
        />
      )}
      {cloneOpen && (
        <PromptDialog
          title="Clone repository (git URL)"
          confirmLabel="Clone"
          onSubmit={(url) => void cloneRepo(url)}
          onCancel={() => setCloneOpen(false)}
        />
      )}
    </div>
  );
}
