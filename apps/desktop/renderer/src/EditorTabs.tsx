import React from 'react';
import type { EditorTabsApi } from './useEditorTabs';
import { FileIcon } from './FileTree';

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
      {tabs.tabs.map((path) => {
        const name = basename(path);
        return (
          <span
            key={path}
            className="editor-tab"
            data-active={path === tabs.activePath}
            // Middle-click closes the tab (common IDE shortcut).
            onAuxClick={(e) => {
              if (e.button === 1) tabs.close(path);
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={path === tabs.activePath}
              onClick={() => tabs.activate(path)}
            >
              <FileIcon name={name} />
              {name}
              {tabs.isDirty(path) ? <span className="tab-dirty"> ●</span> : null}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={`close ${name}`}
              onClick={() => tabs.close(path)}
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}
