import React, { useState } from 'react';
import type * as Monaco from 'monaco-editor';
import { CodeEditor, languageForPath, type EditorOptions } from '@strix/editor';
import { complete } from '@strix/ai-gateway';
import type { FileBuffer } from './useFileBuffer';
import { LspClient, languageForLsp, lspToMonacoMarkers } from './lspClient';
import { connectCollab, roomForPath, pickUserColor } from './collab';
import { MarkdownPreview } from './MarkdownPreview';

export function FileViewer({
  path,
  buffer,
  onCursorChange,
  onMarkersChange,
  onOpenFolder,
  onOpenFile,
  onCloneRepo,
  editorOptions,
  registerFormat,
}: {
  path: string | null;
  buffer: FileBuffer | null;
  onCursorChange?: (pos: { line: number; column: number }) => void;
  onMarkersChange?: (counts: { errors: number; warnings: number }) => void;
  onOpenFolder?: () => void;
  onOpenFile?: () => void;
  onCloneRepo?: () => void;
  editorOptions?: EditorOptions;
  // Hands a "format the document" callback up to App (null on unmount).
  registerFormat?: (run: (() => void) | null) => void;
}) {
  const [showPreview, setShowPreview] = useState(true);
  const isMarkdown = path ? languageForPath(path) === 'markdown' : false;

  if (!path || !buffer) {
    return (
      <div className="empty-state welcome">
        <div className="welcome-logo">Strix</div>
        <p className="welcome-tagline">AI-native code editor</p>
        {(onOpenFolder || onOpenFile || onCloneRepo) && (
          <div className="welcome-actions">
            {onOpenFolder && (
              <button type="button" onClick={onOpenFolder}>
                Open Folder
              </button>
            )}
            {onCloneRepo && (
              <button type="button" onClick={onCloneRepo}>
                Clone Repository…
              </button>
            )}
            {onOpenFile && (
              <button type="button" className="ai-ghost-btn" onClick={onOpenFile}>
                Open File…
              </button>
            )}
          </div>
        )}
        <ul className="welcome-hints">
          <li>
            <span>Open a file</span>
            <kbd>click in the Explorer</kbd>
          </li>
          <li>
            <span>Generate code from a comment</span>
            <kbd>Ctrl+G</kbd>
          </li>
          <li>
            <span>Ask the AI assistant</span>
            <kbd>panel on the right</kbd>
          </li>
        </ul>
      </div>
    );
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
        {isMarkdown && (
          <button
            type="button"
            className="ai-ghost-btn toolbar-right"
            aria-pressed={showPreview}
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        )}
      </div>
      <div className="editor-host">
        {isMarkdown && showPreview ? (
          <MarkdownPreview content={buffer.draft} />
        ) : (
        <CodeEditor
          value={buffer.draft}
          language={languageForPath(path)}
          editorOptions={editorOptions}
          onChange={buffer.setDraft}
          onCursorChange={onCursorChange}
          onGenerate={(description, fileContent) =>
            complete('generate', { filePath: path, fileContent, userMessage: description })
          }
          onEditorMount={(editor, monaco) => {
            const model = editor.getModel();
            if (!model) return;
            const disposers: (() => void)[] = [];

            // Expose a Format Document action to App-level commands/shortcuts.
            if (registerFormat) {
              registerFormat(() => {
                void editor.getAction('editor.action.formatDocument')?.run();
              });
              disposers.push(() => registerFormat(null));
            }

            // Report error/warning counts to the status bar's Problems item.
            if (onMarkersChange) {
              const report = () => {
                const markers = monaco.editor.getModelMarkers({});
                let errors = 0;
                let warnings = 0;
                for (const m of markers) {
                  if (m.severity === monaco.MarkerSeverity.Error) errors++;
                  else if (m.severity === monaco.MarkerSeverity.Warning) warnings++;
                }
                onMarkersChange({ errors, warnings });
              };
              const markerSub = monaco.editor.onDidChangeMarkers(report);
              report();
              disposers.push(() => markerSub.dispose());
            }

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
        )}
      </div>
    </div>
  );
}
