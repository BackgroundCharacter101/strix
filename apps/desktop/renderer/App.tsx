import React, { useEffect, useState } from 'react';
import { FileTree } from './src/FileTree';
import { FileViewer } from './src/FileViewer';
import { EditorTabs } from './src/EditorTabs';
import { AiPanel } from './src/AiPanel';
import { GitStatusBar } from './src/GitStatusBar';
import { StatusBar } from './src/StatusBar';
import { TerminalTabs } from './src/TerminalTabs';
import { useEditorTabs } from './src/useEditorTabs';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const tabs = useEditorTabs();

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
            <FileTree rootPath={root} onSelectFile={(node) => tabs.open(node.path)} />
          ) : (
            <p className="muted">Opening workspace…</p>
          )}
        </aside>
        <main className="editor-pane">
          <EditorTabs tabs={tabs} />
          <FileViewer path={tabs.activePath} buffer={tabs.active} onCursorChange={setCursor} />
        </main>
        <aside className="ai-pane">
          <AiPanel filePath={tabs.activePath} fileContent={tabs.active?.draft ?? ''} />
        </aside>
      </div>
      <section className="panel">
        <TerminalTabs />
      </section>
      <StatusBar path={tabs.activePath} dirty={tabs.active?.dirty ?? false} cursor={cursor} />
    </div>
  );
}
