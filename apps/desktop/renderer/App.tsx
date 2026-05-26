import React, { useEffect, useState } from 'react';
import { FileTree } from './src/FileTree';
import { FileViewer } from './src/FileViewer';
import { EditorTabs } from './src/EditorTabs';
import { Breadcrumbs } from './src/Breadcrumbs';
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
  const tabs = useEditorTabs();

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabs]);

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
              <FileViewer path={tabs.activePath} buffer={tabs.active} onCursorChange={setCursor} />
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
      />
    </div>
  );
}
