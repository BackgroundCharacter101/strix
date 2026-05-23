import React, { useEffect, useState } from 'react';
import { FileTree } from './src/FileTree';
import { FileViewer } from './src/FileViewer';
import { AiPanel } from './src/AiPanel';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    window.tabea.workspace.root().then(setRoot);
  }, []);

  return (
    <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>Tabea IDE</h1>
      <div style={{ display: 'flex', gap: 16 }}>
        {root ? (
          <FileTree rootPath={root} onSelectFile={(node) => setSelectedPath(node.path)} />
        ) : (
          <p>Opening workspace…</p>
        )}
        <FileViewer path={selectedPath} />
        <AiPanel filePath={selectedPath} />
      </div>
    </div>
  );
}
