import React from 'react';
import type * as Monaco from 'monaco-editor';
import { CodeEditor, languageForPath } from '@strix/editor';
import { complete } from '@strix/ai-gateway';
import type { FileBuffer } from './useFileBuffer';
import { LspClient, languageForLsp, lspToMonacoMarkers } from './lspClient';

export function FileViewer({
  path,
  buffer,
  onCursorChange,
}: {
  path: string | null;
  buffer: FileBuffer | null;
  onCursorChange?: (pos: { line: number; column: number }) => void;
}) {
  if (!path || !buffer) {
    return <p className="empty-state">No file selected</p>;
  }
  if (buffer.loading) {
    return (
      <div className="empty-state" role="status">
        Loading…
      </div>
    );
  }
  if (buffer.error) {
    return (
      <div className="empty-state" role="alert">
        {buffer.error}
      </div>
    );
  }

  return (
    <div className="file-viewer">
      <div className="toolbar">
        <button type="button" onClick={buffer.save} disabled={!buffer.dirty || buffer.saving}>
          {buffer.saving ? 'Saving…' : 'Save'}
        </button>
        {buffer.dirty && (
          <span className="dirty-dot" aria-label="unsaved changes">
            ● unsaved
          </span>
        )}
        {buffer.saveError && <span role="alert">{buffer.saveError}</span>}
      </div>
      <div className="editor-host">
        <CodeEditor
          value={buffer.draft}
          language={languageForPath(path)}
          onChange={buffer.setDraft}
          onCursorChange={onCursorChange}
          onGenerate={(description, fileContent) =>
            complete('generate', { filePath: path, fileContent, userMessage: description })
          }
          onEditorMount={(editor, monaco) => {
            const language = languageForLsp(path);
            const model = editor.getModel();
            if (!language || !model) return;
            const client = new LspClient(window.strix.lsp, {
              language,
              uri: model.uri.toString(),
              languageId: model.getLanguageId(),
              text: model.getValue(),
              onDiagnostics: (diags) =>
                monaco.editor.setModelMarkers(
                  model,
                  'strix-lsp',
                  lspToMonacoMarkers(diags) as Monaco.editor.IMarkerData[],
                ),
            });
            void client.start();
            const sub = editor.onDidChangeModelContent(() => client.didChange(model.getValue()));
            return () => {
              sub.dispose();
              client.stop();
            };
          }}
        />
      </div>
    </div>
  );
}
