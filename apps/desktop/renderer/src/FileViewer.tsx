import React from 'react';
import { CodeEditor, languageForPath } from '@strix/editor';
import type { FileBuffer } from './useFileBuffer';

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
        />
      </div>
    </div>
  );
}
