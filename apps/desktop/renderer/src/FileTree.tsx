import React, { useState } from 'react';
import type { FileNode } from '../../main/fs';
import { useFileTree } from './useFileTree';

// Short type badge shown before a file name (a lightweight "icon").
export function fileBadge(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'TS',
    tsx: 'TS',
    js: 'JS',
    jsx: 'JS',
    mjs: 'JS',
    cjs: 'JS',
    json: '{}',
    md: 'MD',
    css: '#',
    html: '<>',
    py: 'PY',
    sh: 'SH',
    yml: 'YML',
    yaml: 'YML',
  };
  return map[ext] ?? '·';
}

interface TreeNodeProps {
  node: FileNode;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelectFile?: (node: FileNode) => void;
}

function TreeNode({ node, expanded, onToggle, onSelectFile }: TreeNodeProps) {
  if (node.type === 'file') {
    return (
      <li data-type="file">
        <button type="button" className="tree-row tree-file" onClick={() => onSelectFile?.(node)}>
          <span className="tree-badge">{fileBadge(node.name)}</span>
          {node.name}
        </button>
      </li>
    );
  }

  const isOpen = expanded.has(node.path);
  return (
    <li data-type="directory">
      <button
        type="button"
        className="tree-row tree-folder"
        aria-expanded={isOpen}
        onClick={() => onToggle(node.path)}
      >
        <span className="tree-chevron">{isOpen ? '▾' : '▸'}</span>
        {node.name}
      </button>
      {isOpen && node.children && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export interface FileTreeProps {
  rootPath: string;
  onSelectFile?: (node: FileNode) => void;
}

export function FileTree({ rootPath, onSelectFile }: FileTreeProps) {
  const { tree, loading, error } = useFileTree(rootPath);
  // Root starts expanded; other folders start collapsed.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([rootPath]));

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });

  if (loading) {
    return <div role="status">Loading…</div>;
  }
  if (error) {
    return <div role="alert">{error}</div>;
  }
  if (!tree) {
    return null;
  }

  return (
    <ul aria-label="File tree" className="tree">
      <TreeNode node={tree} expanded={expanded} onToggle={toggle} onSelectFile={onSelectFile} />
    </ul>
  );
}
