import React from 'react';
import type { EditorTabsApi } from './useEditorTabs';
import { FileIcon } from './FileTree';
import { SplitIcon } from './icons';

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
}

export function EditorTabs({
  tabs,
  onSplit,
  onCloseGroup,
}: {
  tabs: EditorTabsApi;
  onSplit?: () => void;
  // When set, the group shows a ✕ to collapse the split back to one editor.
  onCloseGroup?: () => void;
}) {
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
            // Drag a tab onto an editor group to open it there / split.
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/strix-path', path);
              e.dataTransfer.effectAllowed = 'copy';
            }}
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
              <span className="tab-name">{name}</span>
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
      {onSplit && (
        <button
          type="button"
          className="editor-tabs-split"
          aria-label="Split editor"
          title="Split editor — cycle 1/2/3 groups (Ctrl+\)"
          onClick={onSplit}
        >
          <SplitIcon />
        </button>
      )}
      {onCloseGroup && (
        <button
          type="button"
          className="editor-tabs-split"
          aria-label="Close split"
          title="Unsplit — back to one editor"
          onClick={onCloseGroup}
        >
          ×
        </button>
      )}
    </div>
  );
}
