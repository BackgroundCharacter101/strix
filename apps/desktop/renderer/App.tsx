import React, { useEffect, useState } from 'react';
import { FileTree } from './src/FileTree';
import { FileViewer } from './src/FileViewer';
import { AiPanel } from './src/AiPanel';
import { GitStatusBar } from './src/GitStatusBar';
import { TerminalTabs } from './src/TerminalTabs';
import { useFileBuffer } from './src/useFileBuffer';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const buffer = useFileBuffer(selectedPath);

  useEffect(() => {
    window.strix.workspace.root().then(setRoot);
  }, []);

  return (
    <div className="app">
      <header className="titlebar">
        <span className="app-title">Strix IDE</span>
        <GitStatusBar rootPath={root} />
      </header>
      <div className="workbench">
        <aside className="sidebar">
          {root ? (
            <FileTree rootPath={root} onSelectFile={(node) => setSelectedPath(node.path)} />
          ) : (
            <p className="muted">Opening workspace…</p>
          )}
        </aside>
        <main className="editor-pane">
          <FileViewer path={selectedPath} buffer={buffer} />
        </main>
        <aside className="ai-pane">
          <AiPanel filePath={selectedPath} fileContent={buffer.draft} />
        </aside>
      </div>
      <section className="panel">
        <TerminalTabs />
      </section>
    </div>
  );
}
