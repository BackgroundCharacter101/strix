import React from 'react';
import type { FileNode } from '../../main/fs';
import { useFileTree } from './useFileTree';

interface TreeNodeProps {
  node: FileNode;
  onSelectFile?: (node: FileNode) => void;
}

function TreeNode({ node, onSelectFile }: TreeNodeProps) {
  const hasChildren = node.type === 'directory' && !!node.children?.length;

  return (
    <li data-type={node.type}>
      {node.type === 'file' ? (
        <button type="button" onClick={() => onSelectFile?.(node)}>
          {node.name}
        </button>
      ) : (
        <span>{node.name}</span>
      )}
      {hasChildren && (
        <ul>
          {node.children!.map((child) => (
            <TreeNode key={child.path} node={child} onSelectFile={onSelectFile} />
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
    <ul aria-label="File tree">
      <TreeNode node={tree} onSelectFile={onSelectFile} />
    </ul>
  );
}
