import React, { useEffect, useState } from 'react';
import { FileTree } from './src/FileTree';
import { FileViewer } from './src/FileViewer';
import { EditorTabs } from './src/EditorTabs';
import { AiPanel } from './src/AiPanel';
import { GitStatusBar } from './src/GitStatusBar';
import { StatusBar } from './src/StatusBar';
import { TerminalTabs } from './src/TerminalTabs';
import { useEditorTabs } from './src/useEditorTabs';
import { useResizable } from './src/useResizable';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const tabs = useEditorTabs();

  const sidebar = useResizable(260, { axis: 'x', direction: 1, min: 150, max: 500 });
  const aiPanel = useResizable(340, { axis: 'x', direction: -1, min: 220, max: 600 });
  const terminal = useResizable(260, { axis: 'y', direction: -1, min: 120, max: 600 });

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
        <aside className="sidebar" style={{ width: sidebar.size }}>
          {root ? (
            <FileTree rootPath={root} onSelectFile={(node) => tabs.open(node.path)} />
          ) : (
            <p className="muted">Opening workspace…</p>
          )}
        </aside>
        <div className="resizer resizer-x" onPointerDown={sidebar.onPointerDown} />
        <main className="editor-pane">
          <EditorTabs tabs={tabs} />
          <FileViewer path={tabs.activePath} buffer={tabs.active} onCursorChange={setCursor} />
        </main>
        <div className="resizer resizer-x" onPointerDown={aiPanel.onPointerDown} />
        <aside className="ai-pane" style={{ width: aiPanel.size }}>
          <AiPanel
            filePath={tabs.activePath}
            fileContent={tabs.active?.draft ?? ''}
            onApplyEdit={(content) => tabs.active?.setDraft(content)}
          />
        </aside>
      </div>
      <div className="resizer resizer-y" onPointerDown={terminal.onPointerDown} />
      <section className="panel" style={{ height: terminal.size }}>
        <TerminalTabs />
      </section>
      <StatusBar path={tabs.activePath} dirty={tabs.active?.dirty ?? false} cursor={cursor} />
    </div>
  );
}
