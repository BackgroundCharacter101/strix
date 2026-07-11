import React, { useEffect, useRef, useState } from 'react';
import type { FileNode } from '../../main/fs';
import { useFileTree } from './useFileTree';
import { FileGlyph, FolderGlyph } from './icons';
import { ContextMenu } from './ContextMenu';
import { PromptDialog } from './PromptDialog';
import { useIconTheme } from './iconTheme';
import { MaterialFileIcon, MaterialFolderIcon } from './materialIcons';

const sepOf = (p: string) => (p.includes('\\') ? '\\' : '/');
const dirnameOf = (p: string) => {
  const s = sepOf(p);
  const i = p.lastIndexOf(s);
  return i <= 0 ? p : p.slice(0, i);
};
const joinPath = (dir: string, name: string) => `${dir}${sepOf(dir)}${name}`;

type Dialog = { kind: 'newFile' | 'newFolder' | 'rename'; node: FileNode };
type Menu = { node: FileNode; x: number; y: number; root?: boolean };

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
// Honours the active icon theme (Material = colourful set, Strix = monochrome).
export function FileIcon({ name }: { name: string }) {
  const theme = useIconTheme();
  if (theme === 'material') {
    return (
      <span className="ftype-icon ftype-material">
        <MaterialFileIcon name={name} />
      </span>
    );
  }
  return (
    <span className="ftype-icon" data-ext={fileKind(name)}>
      <FileGlyph />
    </span>
  );
}

// Theme-aware folder glyph (Material colourful folders vs the Strix outline).
export function FolderIcon({ open, name }: { open?: boolean; name: string }) {
  const theme = useIconTheme();
  if (theme === 'material') return <MaterialFolderIcon open={open} name={name} />;
  return <FolderGlyph open={open} />;
}

export interface FlatRow {
  node: FileNode;
  depth: number;
}

// Flatten the tree into the rows that are currently *visible* (a folder's
// children only when it's expanded). Pure → unit-tested; drives virtualization
// so we render only the rows in (or near) the viewport, not the whole tree.
export function flattenVisible(
  root: FileNode,
  expanded: Set<string>,
  depth = 0,
  out: FlatRow[] = [],
): FlatRow[] {
  out.push({ node: root, depth });
  if (root.type === 'directory' && expanded.has(root.path) && root.children) {
    for (const child of root.children) flattenVisible(child, expanded, depth + 1, out);
  }
  return out;
}

interface TreeRowProps {
  row: FlatRow;
  expanded: Set<string>;
  activePath?: string | null;
  onToggle: (path: string) => void;
  onSelectFile?: (node: FileNode) => void;
  onContext: (node: FileNode, e: React.MouseEvent) => void;
  style: React.CSSProperties;
}

// One flat tree row. Indentation comes from depth (inline padding) instead of
// nested <ul>s, so a row can be rendered in isolation by the virtual window.
function TreeRow({ row, expanded, activePath, onToggle, onSelectFile, onContext, style }: TreeRowProps) {
  const { node, depth } = row;
  const indent = { paddingLeft: 8 + depth * 12 };
  if (node.type === 'file') {
    const active = node.path === activePath;
    return (
      <li data-type="file" style={style}>
        <button
          type="button"
          className="tree-row tree-file"
          style={indent}
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
    <li data-type="directory" style={style}>
      <button
        type="button"
        className="tree-row tree-folder"
        style={indent}
        aria-expanded={isOpen}
        onClick={() => onToggle(node.path)}
        onContextMenu={(e) => onContext(node, e)}
      >
        <span className="tree-chevron">{isOpen ? '▾' : '▸'}</span>
        <span className="tree-folder-icon">
          <FolderIcon open={isOpen} name={node.name} />
        </span>
        <span className="tree-name">{node.name}</span>
      </button>
    </li>
  );
}

const ROW_H = 24; // px per row; keep in sync with .tree-row height in styles.css
const OVERSCAN = 8; // rows rendered above/below the viewport

export interface FileTreeProps {
  rootPath: string;
  activePath?: string | null;
  onSelectFile?: (node: FileNode) => void;
  // Open a file in a second editor group (right-click → Open to the Side).
  onOpenToSide?: (node: FileNode) => void;
}

export function FileTree({ rootPath, activePath, onSelectFile, onOpenToSide }: FileTreeProps) {
  const { tree, loading, error, truncated, reload } = useFileTree(rootPath);
  // Root starts expanded; other folders start collapsed.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([rootPath]));
  const [menu, setMenu] = useState<Menu | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Virtual window: track scroll position + viewport height so we render only
  // the visible rows. viewH=0 (e.g. jsdom / before layout) → render everything.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

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

  // Root actions — shown when clicking/right-clicking the empty explorer area,
  // so the user can create a file/folder at the project root without a node.
  const rootMenuItems = (root: FileNode) => [
    { label: 'New File…', onClick: () => setDialog({ kind: 'newFile', node: root }) },
    { label: 'New Folder…', onClick: () => setDialog({ kind: 'newFolder', node: root }) },
  ];

  // Open the root menu when the click/context is on empty space (not a row).
  const onEmptyArea = (e: React.MouseEvent) => {
    if (!tree || (e.target as HTMLElement).closest('.tree-row')) return;
    e.preventDefault();
    setMenu({ node: tree, x: e.clientX, y: e.clientY, root: true });
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

  const rows = flattenVisible(tree, expanded);
  const total = rows.length;
  const windowed = viewH > 0;
  const start = windowed ? Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN) : 0;
  const end = windowed ? Math.min(total, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN) : total;
  const slice = rows.slice(start, end);

  return (
    <>
      {truncated && (
        <div className="tree-truncated" role="note" title="Large project — the file list was capped to stay fast. Add folders to Settings → Editor → Exclude folders.">
          Large project — list capped
        </div>
      )}
      <div
        className="tree-scroll"
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onClick={onEmptyArea}
        onContextMenu={onEmptyArea}
      >
        <ul aria-label="File tree" className="tree" style={{ height: total * ROW_H }}>
          {slice.map((row) => (
            <TreeRow
              key={row.node.path}
              row={row}
              expanded={expanded}
              activePath={activePath}
              onToggle={toggle}
              onSelectFile={onSelectFile}
              onContext={onContext}
              style={{
                position: 'absolute',
                top: (start + slice.indexOf(row)) * ROW_H,
                left: 0,
                right: 0,
              }}
            />
          ))}
        </ul>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.root ? rootMenuItems(menu.node) : menuItems(menu.node)}
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
