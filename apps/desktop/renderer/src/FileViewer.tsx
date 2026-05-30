import React, { useState } from 'react';
import type * as Monaco from 'monaco-editor';
import { CodeEditor, languageForPath, type EditorOptions } from '@strix/editor';
import { complete } from '@strix/ai-gateway';
import type { FileBuffer } from './useFileBuffer';
import { LspClient, languageForLsp, lspToMonacoMarkers } from './lspClient';
import { connectCollab, roomForPath, pickUserColor } from './collab';
import { MarkdownPreview } from './MarkdownPreview';
import { HexViewer } from './HexViewer';
import { OwlIcon } from './icons';

export function FileViewer({
  path,
  buffer,
  onCursorChange,
  onMarkersChange,
  onOpenFolder,
  onOpenFile,
  onCloneRepo,
  onLanguages,
  editorOptions,
  theme,
  registerFormat,
  onSelectionAction,
}: {
  path: string | null;
  buffer: FileBuffer | null;
  onCursorChange?: (pos: { line: number; column: number }) => void;
  onMarkersChange?: (counts: { errors: number; warnings: number }) => void;
  onOpenFolder?: () => void;
  onOpenFile?: () => void;
  onCloneRepo?: () => void;
  onLanguages?: () => void;
  editorOptions?: EditorOptions;
  theme?: string;
  // Hands a "format the document" callback up to App (null on unmount).
  registerFormat?: (run: (() => void) | null) => void;
  // Explain/Fix on the current editor selection (floating toolbar).
  onSelectionAction?: (kind: 'explain' | 'fix', selection: string) => void;
}) {
  const [showPreview, setShowPreview] = useState(true);
  const [hexOverride, setHexOverride] = useState<boolean | null>(null);
  const isMarkdown = path ? languageForPath(path) === 'markdown' : false;
  // A NUL byte in the decoded text strongly implies a binary file.
  const isBinary = (buffer?.draft ?? '').includes(String.fromCharCode(0));
  const showHex = hexOverride ?? isBinary;

  if (!path || !buffer) {
    return (
      <div className="empty-state welcome">
        <div className="welcome-mark">
          <OwlIcon size={72} />
        </div>
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
            {onLanguages && (
              <button type="button" className="ai-ghost-btn" onClick={onLanguages}>
                Languages & Extensions…
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
        <span className="toolbar-right" />
        <button
          type="button"
          className="ai-ghost-btn"
          aria-pressed={showHex}
          title="Toggle hex view"
          onClick={() => setHexOverride(!showHex)}
        >
          {showHex ? 'Text' : 'Hex'}
        </button>
        {isMarkdown && !showHex && (
          <button
            type="button"
            className="ai-ghost-btn"
            aria-pressed={showPreview}
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        )}
      </div>
      <div className="editor-host">
        {showHex ? (
          <HexViewer path={path} />
        ) : isMarkdown && showPreview ? (
          <MarkdownPreview content={buffer.draft} />
        ) : (
        <CodeEditor
          value={buffer.draft}
          language={languageForPath(path)}
          editorOptions={editorOptions}
          theme={theme}
          onChange={buffer.setDraft}
          onCursorChange={onCursorChange}
          onGenerate={(description, fileContent) =>
            complete('generate', { filePath: path, fileContent, userMessage: description })
          }
          onEditorMount={(editor, monaco) => {
            const model = editor.getModel();
            if (!model) return;
            const disposers: (() => void)[] = [];

            // Floating Explain/Fix toolbar that appears over a non-empty selection.
            if (onSelectionAction) {
              let anchor: { lineNumber: number; column: number } | null = null;
              let node: HTMLDivElement | null = null;
              const makeBtn = (label: string, kind: 'explain' | 'fix') => {
                const b = document.createElement('button');
                b.textContent = label;
                b.className = 'sel-toolbar-btn';
                // mousedown (not click) keeps the editor selection intact.
                b.addEventListener('mousedown', (ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  const sel = editor.getSelection();
                  const text = sel ? model.getValueInRange(sel) : '';
                  if (text.trim()) onSelectionAction(kind, text);
                });
                return b;
              };
              const widget = {
                getId: () => 'strix.selectionToolbar',
                getDomNode: () => {
                  if (!node) {
                    node = document.createElement('div');
                    node.className = 'sel-toolbar';
                    node.appendChild(makeBtn('✦ Explain', 'explain'));
                    node.appendChild(makeBtn('✦ Fix', 'fix'));
                  }
                  return node;
                },
                getPosition: () =>
                  anchor
                    ? {
                        position: anchor,
                        preference: [
                          monaco.editor.ContentWidgetPositionPreference.ABOVE,
                          monaco.editor.ContentWidgetPositionPreference.BELOW,
                        ],
                      }
                    : null,
              };
              editor.addContentWidget(widget);
              const selSub = editor.onDidChangeCursorSelection((e) => {
                const text = model.getValueInRange(e.selection);
                anchor =
                  text.trim().length > 0 && !e.selection.isEmpty()
                    ? { lineNumber: e.selection.startLineNumber, column: e.selection.startColumn }
                    : null;
                editor.layoutContentWidget(widget);
              });
              disposers.push(() => {
                selSub.dispose();
                editor.removeContentWidget(widget);
              });
            }

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
