import React, { useState } from 'react';
import type { FileNode } from '../../main/fs';
import { useFileTree } from './useFileTree';
import { FileGlyph, FolderGlyph } from './icons';

// Map a filename to a normalized file-kind key (drives the badge colour in CSS).
export function fileKind(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const alias: Record<string, string> = {
    tsx: 'ts',
    jsx: 'js',
    mjs: 'js',
    cjs: 'js',
    yaml: 'yml',
  };
  return alias[ext] ?? ext;
}

// Short type badge shown before a file name (a lightweight "icon").
export function fileBadge(name: string): string {
  const map: Record<string, string> = {
    ts: 'TS',
    js: 'JS',
    json: '{}',
    md: 'MD',
    css: '#',
    html: '<>',
    py: 'PY',
    sh: 'SH',
    yml: 'YML',
  };
  return map[fileKind(name)] ?? '·';
}

// Shared file glyph, tinted by file kind. Reused by tree, tabs, breadcrumbs.
export function FileIcon({ name }: { name: string }) {
  return (
    <span className="ftype-icon" data-ext={fileKind(name)}>
      <FileGlyph />
    </span>
  );
}

interface TreeNodeProps {
  node: FileNode;
  expanded: Set<string>;
  activePath?: string | null;
  onToggle: (path: string) => void;
  onSelectFile?: (node: FileNode) => void;
}

function TreeNode({ node, expanded, activePath, onToggle, onSelectFile }: TreeNodeProps) {
  if (node.type === 'file') {
    const active = node.path === activePath;
    return (
      <li data-type="file">
        <button
          type="button"
          className="tree-row tree-file"
          data-active={active}
          aria-current={active ? 'true' : undefined}
          onClick={() => onSelectFile?.(node)}
        >
          <FileIcon name={node.name} />
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
        <span className="tree-folder-icon">
          <FolderGlyph open={isOpen} />
        </span>
        {node.name}
      </button>
      {isOpen && node.children && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              expanded={expanded}
              activePath={activePath}
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
  activePath?: string | null;
  onSelectFile?: (node: FileNode) => void;
}

export function FileTree({ rootPath, activePath, onSelectFile }: FileTreeProps) {
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
      <TreeNode
        node={tree}
        expanded={expanded}
        activePath={activePath}
        onToggle={toggle}
        onSelectFile={onSelectFile}
      />
    </ul>
  );
}
