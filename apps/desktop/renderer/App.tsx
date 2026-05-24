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
    <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1>Strix IDE</h1>
        <GitStatusBar rootPath={root} />
      </header>
      <div style={{ display: 'flex', gap: 16 }}>
        {root ? (
          <FileTree rootPath={root} onSelectFile={(node) => setSelectedPath(node.path)} />
        ) : (
          <p>Opening workspace…</p>
        )}
        <FileViewer path={selectedPath} buffer={buffer} />
        <AiPanel filePath={selectedPath} fileContent={buffer.draft} />
      </div>
      <TerminalTabs />
    </div>
  );
}
