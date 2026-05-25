import React from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

export interface CursorPosition {
  line: number;
  column: number;
}

export interface CodeEditorProps {
  value: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onCursorChange?: (pos: CursorPosition) => void;
}

// Thin wrapper around Monaco (via @monaco-editor/react) so the rest of the
// app depends on a stable, app-shaped API rather than Monaco directly.
export function CodeEditor({
  value,
  language,
  readOnly,
  onChange,
  onCursorChange,
}: CodeEditorProps) {
  const handleMount: OnMount = (editor) => {
    editor.onDidChangeCursorPosition((e) =>
      onCursorChange?.({ line: e.position.lineNumber, column: e.position.column }),
    );
  };

  return (
    <Editor
      value={value}
      language={language}
      options={{ readOnly, minimap: { enabled: false }, automaticLayout: true }}
      onChange={(next) => onChange?.(next ?? '')}
      onMount={handleMount}
    />
  );
}

// Map a file path to a Monaco language id. Falls back to plaintext.
export function languageForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    py: 'python',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
  };
  return map[ext] ?? 'plaintext';
}
