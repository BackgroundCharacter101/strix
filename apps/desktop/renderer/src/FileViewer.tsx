import React, { useState } from 'react';
import type * as Monaco from 'monaco-editor';
import { CodeEditor, languageForPath, type EditorOptions } from '@strix/editor';
import { complete } from '@strix/ai-gateway';
import type { FileBuffer } from './useFileBuffer';
import {
  LspClient,
  languageForLsp,
  lspToMonacoMarkers,
  normalizeCompletionItems,
  hoverToMarkdown,
  normalizeLocations,
  normalizeSymbols,
  LSP_COMPLETION_KIND,
  LSP_SYMBOL_KIND,
  type LspPosition,
  type NormalizedSymbol,
} from './lspClient';
import { connectCollab, roomForPath, pickUserColor } from './collab';
import { MarkdownPreview } from './MarkdownPreview';
import { OwlIcon } from './icons';

// LSP completion/hover/definition need ONE global Monaco provider per language
// that routes to the client for the queried model (Monaco providers are global,
// but each open file has its own LspClient). The registry maps model URI →
// client; providers are registered once per language.
const lspClients = new Map<string, LspClient>();
const lspProviderLangs = new Set<string>();

function toLspPos(p: Monaco.Position): LspPosition {
  return { line: p.lineNumber - 1, character: p.column - 1 };
}

// Strip a leading/trailing ``` fence from AI output so a code-only fix applies
// cleanly into the editor.
function stripCodeFences(s: string): string {
  const t = s.trim();
  const m = t.match(/^```[\w-]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : t;
}

function ensureLspProviders(monaco: typeof import('monaco-editor'), languageId: string): void {
  if (lspProviderLangs.has(languageId)) return;
  lspProviderLangs.add(languageId);

  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', ':', '>', '"', "'", '/', '@', '('],
    provideCompletionItems: async (model, position) => {
      const client = lspClients.get(model.uri.toString());
      if (!client) return { suggestions: [] };
      const items = normalizeCompletionItems(await client.completion(toLspPos(position)));
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      return {
        suggestions: items.map((it) => ({
          label: it.label,
          kind: monaco.languages.CompletionItemKind[
            (LSP_COMPLETION_KIND[it.kind ?? 1] ??
              'Text') as keyof typeof monaco.languages.CompletionItemKind
          ],
          insertText: it.insertText ?? it.label,
          detail: it.detail,
          documentation:
            typeof it.documentation === 'string' ? it.documentation : it.documentation?.value,
          sortText: it.sortText,
          range,
        })),
      };
    },
  });

  monaco.languages.registerHoverProvider(languageId, {
    provideHover: async (model, position) => {
      const client = lspClients.get(model.uri.toString());
      if (!client) return null;
      const md = hoverToMarkdown(await client.hover(toLspPos(position)));
      return md ? { contents: [{ value: md }] } : null;
    },
  });

  monaco.languages.registerDefinitionProvider(languageId, {
    provideDefinition: async (model, position) => {
      const client = lspClients.get(model.uri.toString());
      if (!client) return null;
      return normalizeLocations(await client.definition(toLspPos(position))).map((l) => ({
        uri: monaco.Uri.parse(l.uri),
        range: new monaco.Range(
          l.range.start.line + 1,
          l.range.start.character + 1,
          l.range.end.line + 1,
          l.range.end.character + 1,
        ),
      }));
    },
  });

  // Document symbols → Go to Symbol (Ctrl+Shift+O), outline, and sticky scroll.
  const lspRange = (r: NormalizedSymbol['range']) =>
    new monaco.Range(
      r.start.line + 1,
      r.start.character + 1,
      r.end.line + 1,
      r.end.character + 1,
    );
  const toMonacoSymbol = (s: NormalizedSymbol): Monaco.languages.DocumentSymbol => ({
    name: s.name,
    detail: s.detail ?? '',
    kind: monaco.languages.SymbolKind[
      (LSP_SYMBOL_KIND[s.kind] ?? 'Variable') as keyof typeof monaco.languages.SymbolKind
    ],
    tags: [],
    range: lspRange(s.range),
    selectionRange: lspRange(s.selectionRange),
    children: s.children.map(toMonacoSymbol),
  });
  monaco.languages.registerDocumentSymbolProvider(languageId, {
    provideDocumentSymbols: async (model) => {
      const client = lspClients.get(model.uri.toString());
      if (!client) return [];
      return normalizeSymbols(await client.documentSymbols()).map(toMonacoSymbol);
    },
  });
}

export function FileViewer({
  path,
  buffer,
  onCursorChange,
  onMarkersChange,
  onOpenFolder,
  onOpenFile,
  onCloneRepo,
  onLanguages,
  recents,
  onOpenRecent,
  rootPath,
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
  // Recently opened folders (most-recent first) + open-one callback.
  recents?: string[];
  onOpenRecent?: (path: string) => void;
  // Workspace root — used as the LSP rootUri so servers load the project config.
  rootPath?: string | null;
  editorOptions?: EditorOptions;
  theme?: string;
  // Hands a "format the document" callback up to App (null on unmount).
  registerFormat?: (run: (() => void) | null) => void;
  // Explain/Fix on the current editor selection (floating toolbar).
  onSelectionAction?: (kind: 'explain' | 'fix', selection: string) => void;
}) {
  const [showPreview, setShowPreview] = useState(true);
  const isMarkdown = path ? languageForPath(path) === 'markdown' : false;
  // A NUL byte in the decoded text strongly implies a binary file.
  const isBinary = (buffer?.draft ?? '').includes(String.fromCharCode(0));

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
        {recents && recents.length > 0 && onOpenRecent && (
          <div className="welcome-recent">
            <div className="welcome-recent-title">Recent</div>
            <ul>
              {recents.slice(0, 5).map((p) => {
                const name = p.split(/[\\/]/).filter(Boolean).pop() ?? p;
                return (
                  <li key={p}>
                    <button
                      type="button"
                      className="welcome-recent-item"
                      title={p}
                      onClick={() => onOpenRecent(p)}
                    >
                      <span className="welcome-recent-name">{name}</span>
                      <span className="welcome-recent-path">{p}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
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
        {isMarkdown && !isBinary && (
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
        {isBinary ? (
          <div className="binary-notice" role="note">
            <p>This is a binary file and can’t be shown in the text editor.</p>
            <p className="binary-notice-path">{path}</p>
          </div>
        ) : isMarkdown && showPreview ? (
          <MarkdownPreview content={buffer.draft} />
        ) : (
        <CodeEditor
          // Key by path so switching files mounts a fresh editor (fixes the
          // editor sticking on the previous file) and re-runs onEditorMount so
          // LSP / the selection toolbar attach to the current file's model.
          key={path}
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
                  if (!sel || !text.trim()) return;
                  if (kind === 'explain') {
                    onSelectionAction?.('explain', text);
                    return;
                  }
                  // Fix: ask the AI for the corrected code and apply it to the
                  // selection live (rather than just chatting the solution).
                  const restore = b.textContent;
                  b.textContent = '✦ Fixing…';
                  b.setAttribute('disabled', 'true');
                  void complete('fix', {
                    filePath: path ?? '',
                    fileContent: text,
                    userMessage:
                      'Return ONLY the corrected version of this exact code. No explanation, no commentary, no markdown fences.',
                  })
                    .then((out) => {
                      const fixed = stripCodeFences(out);
                      if (fixed.trim() && fixed !== text) {
                        editor.executeEdits('strix-fix', [
                          { range: sel, text: fixed, forceMoveMarkers: true },
                        ]);
                        editor.focus();
                      }
                    })
                    .finally(() => {
                      b.textContent = restore;
                      b.removeAttribute('disabled');
                    });
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
                // Use Monaco to build the root URI so its encoding matches the
                // document URIs the server receives (drive-letter casing, etc.).
                rootUri: rootPath ? monaco.Uri.file(rootPath).toString() : null,
                onDiagnostics: (diags) =>
                  monaco.editor.setModelMarkers(
                    model,
                    'strix-lsp',
                    lspToMonacoMarkers(diags) as Monaco.editor.IMarkerData[],
                  ),
              });
              void client.start();
              const uriKey = model.uri.toString();
              lspClients.set(uriKey, client);
              ensureLspProviders(monaco, model.getLanguageId());
              const sub = editor.onDidChangeModelContent(() => client.didChange(model.getValue()));
              disposers.push(() => {
                sub.dispose();
                client.stop();
                lspClients.delete(uriKey);
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
