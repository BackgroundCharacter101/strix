import React from 'react';
import { CodeEditor, languageForPath } from '@strix/editor';
import type { FileBuffer } from './useFileBuffer';

export function FileViewer({ path, buffer }: { path: string | null; buffer: FileBuffer }) {
  if (!path) {
    return <p>No file selected</p>;
  }
  if (buffer.loading) {
    return <div role="status">Loading…</div>;
  }
  if (buffer.error) {
    return <div role="alert">{buffer.error}</div>;
  }

  return (
    <div>
      <div style={{ height: 400, width: '100%' }}>
        <CodeEditor value={buffer.draft} language={languageForPath(path)} onChange={buffer.setDraft} />
      </div>
      <button type="button" onClick={buffer.save} disabled={!buffer.dirty || buffer.saving}>
        Save
      </button>
      {buffer.dirty && <span aria-label="unsaved changes">●</span>}
      {buffer.saveError && <span role="alert">{buffer.saveError}</span>}
    </div>
  );
}
