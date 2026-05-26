import React from 'react';
import type * as Monaco from 'monaco-editor';
import { CodeEditor, languageForPath } from '@strix/editor';
import { complete } from '@strix/ai-gateway';
import type { FileBuffer } from './useFileBuffer';
import { LspClient, languageForLsp, lspToMonacoMarkers } from './lspClient';
import { connectCollab, roomForPath, pickUserColor } from './collab';

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
            const model = editor.getModel();
            if (!model) return;
            const disposers: (() => void)[] = [];

            // LSP diagnostics (§6.5)
            const language = languageForLsp(path);
            if (language) {
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
              disposers.push(() => {
                sub.dispose();
                client.stop();
              });
            }

            // Real-time collaboration (§6.6) — opt-in via COLLAB_SERVER_URL
            void window.strix.collab.url().then((url) => {
              if (!url) return;
              disposers.push(
                connectCollab({
                  url,
                  room: roomForPath(path),
                  model,
                  editor,
                  user: { name: 'You', color: pickUserColor(path) },
                }),
              );
            });

            return () => disposers.forEach((d) => d());
          }}
        />
      </div>
    </div>
  );
}
