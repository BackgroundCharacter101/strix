import React from 'react';
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react';

export interface CursorPosition {
  line: number;
  column: number;
}

export interface EditorOptions {
  fontSize?: number;
  tabSize?: number;
  wordWrap?: boolean;
  minimap?: boolean;
}

export interface CodeEditorProps {
  value: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onCursorChange?: (pos: CursorPosition) => void;
  /** Resolve generated code for a `# generate: ...` line (§8.5). */
  onGenerate?: (description: string, fileContent: string, language: string) => Promise<string>;
  /** Called once the editor mounts; return a cleanup run on dispose (e.g. LSP). */
  onEditorMount?: (...args: Parameters<OnMount>) => void | (() => void);
  /** User-configurable editor options (font size, tab size, word wrap, minimap). */
  editorOptions?: EditorOptions;
}

// Extract the description from a `# generate: ...` or `// generate: ...` line.
export function parseGenerateComment(line: string): string | null {
  const m = /(?:#|\/\/)\s*generate:\s*(.+?)\s*$/i.exec(line);
  return m ? m[1].trim() : null;
}

// Thin wrapper around Monaco (via @monaco-editor/react) so the rest of the
// app depends on a stable, app-shaped API rather than Monaco directly.
export function CodeEditor({
  value,
  language,
  readOnly,
  onChange,
  onCursorChange,
  onGenerate,
  onEditorMount,
  editorOptions,
}: CodeEditorProps) {
  const handleMount: OnMount = (editor, monaco) => {
    editor.onDidChangeCursorPosition((e) =>
      onCursorChange?.({ line: e.position.lineNumber, column: e.position.column }),
    );

    const dispose = onEditorMount?.(editor, monaco);
    if (typeof dispose === 'function') {
      editor.onDidDispose(dispose);
    }

    // §8.5 Generate from comment: Ctrl/Cmd+G on a `# generate: ...` line
    // inserts the generated code on the following line.
    editor.addAction({
      id: 'strix.generateFromComment',
      label: 'Strix: Generate from comment',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG],
      run: async (ed) => {
        const position = ed.getPosition();
        const model = ed.getModel();
        if (!position || !model || !onGenerate) return;
        const description = parseGenerateComment(model.getLineContent(position.lineNumber));
        if (!description) return;
        const code = await onGenerate(description, model.getValue(), model.getLanguageId());
        if (!code) return;
        const col = model.getLineMaxColumn(position.lineNumber);
        ed.executeEdits('strix.generate', [
          {
            range: new monaco.Range(position.lineNumber, col, position.lineNumber, col),
            text: '\n' + code,
          },
        ]);
      },
    });
  };

  return (
    <Editor
      value={value}
      language={language}
      options={{
        readOnly,
        minimap: { enabled: editorOptions?.minimap ?? false },
        automaticLayout: true,
        inlineSuggest: { enabled: true },
        fontSize: editorOptions?.fontSize ?? 13,
        tabSize: editorOptions?.tabSize ?? 2,
        wordWrap: editorOptions?.wordWrap ? 'on' : 'off',
      }}
      onChange={(next) => onChange?.(next ?? '')}
      onMount={handleMount}
    />
  );
}

export interface DiffViewerProps {
  original: string;
  modified: string;
  language?: string;
}

// Read-only inline diff (original vs an AI-proposed change).
export function DiffViewer({ original, modified, language }: DiffViewerProps) {
  return (
    <DiffEditor
      original={original}
      modified={modified}
      language={language}
      options={{
        readOnly: true,
        renderSideBySide: false,
        minimap: { enabled: false },
        automaticLayout: true,
      }}
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
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    py: 'python',
    sh: 'shell',
    bash: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    // Compiled / systems languages
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    scala: 'scala',
    dart: 'dart',
    // Scripting / data / misc
    rb: 'ruby',
    php: 'php',
    lua: 'lua',
    r: 'r',
    sql: 'sql',
    xml: 'xml',
    toml: 'ini',
    ini: 'ini',
    dockerfile: 'dockerfile',
    graphql: 'graphql',
    gql: 'graphql',
  };
  return map[ext] ?? 'plaintext';
}
