import React from 'react';
import type { EditorTabsApi } from './useEditorTabs';

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
}

export function EditorTabs({ tabs }: { tabs: EditorTabsApi }) {
  if (tabs.tabs.length === 0) {
    return null;
  }

  return (
    <div className="editor-tabs" role="tablist">
      {tabs.tabs.map((path) => (
        <span key={path} className="editor-tab" data-active={path === tabs.activePath}>
          <button
            type="button"
            role="tab"
            aria-selected={path === tabs.activePath}
            onClick={() => tabs.activate(path)}
          >
            {basename(path)}
            {tabs.isDirty(path) ? ' ●' : ''}
          </button>
          <button
            type="button"
            aria-label={`close ${basename(path)}`}
            onClick={() => tabs.close(path)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
