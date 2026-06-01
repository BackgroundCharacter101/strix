import React, { useState } from 'react';
import type { FileNode } from '../../main/fs';
import { useFileTree } from './useFileTree';
import { FileGlyph, FolderGlyph } from './icons';
import { ContextMenu } from './ContextMenu';
import { PromptDialog } from './PromptDialog';

const sepOf = (p: string) => (p.includes('\\') ? '\\' : '/');
const dirnameOf = (p: string) => {
  const s = sepOf(p);
  const i = p.lastIndexOf(s);
  return i <= 0 ? p : p.slice(0, i);
};
const joinPath = (dir: string, name: string) => `${dir}${sepOf(dir)}${name}`;

type Dialog = { kind: 'newFile' | 'newFolder' | 'rename'; node: FileNode };
type Menu = { node: FileNode; x: number; y: number };

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
    rs: 'RS',
    go: 'GO',
    java: 'JV',
    rb: 'RB',
    php: 'PHP',
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
  onContext: (node: FileNode, e: React.MouseEvent) => void;
}

function TreeNode({ node, expanded, activePath, onToggle, onSelectFile, onContext }: TreeNodeProps) {
  if (node.type === 'file') {
    const active = node.path === activePath;
    return (
      <li data-type="file">
        <button
          type="button"
          className="tree-row tree-file"
          data-active={active}
          aria-current={active ? 'true' : undefined}
          // Drag a file onto an editor group to open it / split there.
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/strix-path', node.path);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => onSelectFile?.(node)}
          onContextMenu={(e) => onContext(node, e)}
        >
          <FileIcon name={node.name} />
          <span className="tree-name">{node.name}</span>
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
        onContextMenu={(e) => onContext(node, e)}
      >
        <span className="tree-chevron">{isOpen ? '▾' : '▸'}</span>
        <span className="tree-folder-icon">
          <FolderGlyph open={isOpen} />
        </span>
        <span className="tree-name">{node.name}</span>
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
              onContext={onContext}
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
  // Open a file in a second editor group (right-click → Open to the Side).
  onOpenToSide?: (node: FileNode) => void;
}

export function FileTree({ rootPath, activePath, onSelectFile, onOpenToSide }: FileTreeProps) {
  const { tree, loading, error, reload } = useFileTree(rootPath);
  // Root starts expanded; other folders start collapsed.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([rootPath]));
  const [menu, setMenu] = useState<Menu | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

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

  const onContext = (node: FileNode, e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ node, x: e.clientX, y: e.clientY });
  };

  // The directory a new entry should be created in for the given node.
  const targetDir = (node: FileNode) =>
    node.type === 'directory' ? node.path : dirnameOf(node.path);

  const remove = (node: FileNode) => {
    if (window.confirm(`Delete '${node.name}'? This cannot be undone.`)) {
      void window.strix.fs.remove(node.path).then(reload);
    }
  };

  const submitDialog = (value: string) => {
    if (!dialog) return;
    const { kind, node } = dialog;
    if (kind === 'rename') {
      const dest = joinPath(dirnameOf(node.path), value);
      void window.strix.fs.rename(node.path, dest).then(reload);
    } else {
      const dest = joinPath(targetDir(node), value);
      const type = kind === 'newFolder' ? 'directory' : 'file';
      void window.strix.fs.create(dest, type).then(() => {
        reload();
        if (type === 'file') {
          setExpanded((prev) => new Set(prev).add(targetDir(node)));
          onSelectFile?.({ name: value, path: dest, type: 'file' });
        }
      });
    }
    setDialog(null);
  };

  const menuItems = (node: FileNode) => [
    ...(node.type === 'file' && onOpenToSide
      ? [{ label: 'Open to the Side', onClick: () => onOpenToSide(node) }]
      : []),
    { label: 'New File…', onClick: () => setDialog({ kind: 'newFile', node }) },
    { label: 'New Folder…', onClick: () => setDialog({ kind: 'newFolder', node }) },
    { label: 'Rename…', onClick: () => setDialog({ kind: 'rename', node }) },
    { label: 'Delete', onClick: () => remove(node), danger: true },
  ];

  if (loading) {
    return <div role="status">Loading…</div>;
  }
  if (error) {
    return <div role="alert">{error}</div>;
  }
  if (!tree) {
    return null;
  }

  const dialogTitle =
    dialog?.kind === 'rename'
      ? 'Rename'
      : dialog?.kind === 'newFolder'
        ? 'New folder name'
        : 'New file name';

  return (
    <>
      <ul aria-label="File tree" className="tree">
        <TreeNode
          node={tree}
          expanded={expanded}
          activePath={activePath}
          onToggle={toggle}
          onSelectFile={onSelectFile}
          onContext={onContext}
        />
      </ul>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.node)}
          onClose={() => setMenu(null)}
        />
      )}
      {dialog && (
        <PromptDialog
          title={dialogTitle}
          initialValue={dialog.kind === 'rename' ? dialog.node.name : ''}
          confirmLabel={dialog.kind === 'rename' ? 'Rename' : 'Create'}
          onSubmit={submitDialog}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
}
