import React, { useEffect, useState } from 'react';
import { FileTree } from './src/FileTree';
import { FileViewer } from './src/FileViewer';
import { AiPanel } from './src/AiPanel';
import { GitStatusBar } from './src/GitStatusBar';
import { Terminal } from './src/Terminal';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

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
        <FileViewer path={selectedPath} />
        <AiPanel filePath={selectedPath} />
      </div>
      <Terminal />
    </div>
  );
}
