// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTree, fileBadge, flattenVisible } from './FileTree';
import { makeStrixApi } from '../test-utils';
import type { FileNode } from '../../main/fs';

const tree = vi.fn<[string], Promise<FileNode>>();
const read = vi.fn<[string], Promise<string>>();
const write = vi.fn<[string, string], Promise<void>>();
const create = vi.fn<[string, 'file' | 'directory'], Promise<void>>();
const rename = vi.fn<[string, string], Promise<void>>();
const remove = vi.fn<[string], Promise<void>>();

beforeEach(() => {
  tree.mockReset();
  create.mockReset();
  rename.mockReset();
  remove.mockReset();
  create.mockResolvedValue();
  rename.mockResolvedValue();
  remove.mockResolvedValue();
  window.strix = makeStrixApi({ fs: { tree, read, write, create, rename, remove } });
});

const sample: FileNode = {
  name: 'root',
  path: '/root',
  type: 'directory',
  children: [
    {
      name: 'src',
      path: '/root/src',
      type: 'directory',
      children: [{ name: 'index.ts', path: '/root/src/index.ts', type: 'file' }],
    },
    { name: 'readme.md', path: '/root/readme.md', type: 'file' },
  ],
};

describe('fileBadge', () => {
  it('maps extensions to short type badges', () => {
    expect(fileBadge('a.ts')).toBe('TS');
    expect(fileBadge('a.py')).toBe('PY');
    expect(fileBadge('LICENSE')).toBe('·');
  });
});

describe('flattenVisible', () => {
  it('lists only the root + a collapsed root has no children', () => {
    const rows = flattenVisible(sample, new Set());
    expect(rows.map((r) => r.node.name)).toEqual(['root']);
    expect(rows[0].depth).toBe(0);
  });

  it('includes children of expanded folders with correct depth', () => {
    const rows = flattenVisible(sample, new Set(['/root', '/root/src']));
    expect(rows.map((r) => [r.node.name, r.depth])).toEqual([
      ['root', 0],
      ['src', 1],
      ['index.ts', 2],
      ['readme.md', 1],
    ]);
  });

  it('stops at a collapsed subfolder', () => {
    const rows = flattenVisible(sample, new Set(['/root']));
    expect(rows.map((r) => r.node.name)).toEqual(['root', 'src', 'readme.md']);
  });
});

describe('FileTree', () => {
  it('shows root children but keeps subfolders collapsed until clicked', async () => {
    tree.mockResolvedValue(sample);
    render(<FileTree rootPath="/root" />);

    // Root is expanded: its direct children are visible.
    expect(await screen.findByText('src')).toBeInTheDocument();
    expect(screen.getByText('readme.md')).toBeInTheDocument();
    // 'src' starts collapsed, so its child is hidden.
    expect(screen.queryByText('index.ts')).not.toBeInTheDocument();
    expect(tree).toHaveBeenCalledWith('/root');

    // Expanding 'src' reveals it.
    fireEvent.click(screen.getByText('src'));
    expect(screen.getByText('index.ts')).toBeInTheDocument();

    // Collapsing hides it again.
    fireEvent.click(screen.getByText('src'));
    expect(screen.queryByText('index.ts')).not.toBeInTheDocument();
  });

  it('shows a loading state until the tree resolves', () => {
    tree.mockReturnValue(new Promise<FileNode>(() => {}));
    render(<FileTree rootPath="/root" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('surfaces an error when the bridge call rejects', async () => {
    tree.mockRejectedValue(new Error('permission denied'));
    render(<FileTree rootPath="/root" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied');
  });

  it('fires onSelectFile with the node when a file is clicked', async () => {
    tree.mockResolvedValue(sample);
    const onSelectFile = vi.fn();
    render(<FileTree rootPath="/root" onSelectFile={onSelectFile} />);

    fireEvent.click(await screen.findByText('src')); // expand the folder first
    fireEvent.click(screen.getByText('index.ts'));

    expect(onSelectFile).toHaveBeenCalledTimes(1);
    expect(onSelectFile.mock.calls[0][0].path).toBe('/root/src/index.ts');
  });

  it('offers Open to the Side for files and calls onOpenToSide', async () => {
    tree.mockResolvedValue(sample);
    const onOpenToSide = vi.fn();
    render(<FileTree rootPath="/root" onOpenToSide={onOpenToSide} />);

    fireEvent.contextMenu(await screen.findByText('readme.md'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open to the Side' }));
    expect(onOpenToSide).toHaveBeenCalledTimes(1);
    expect(onOpenToSide.mock.calls[0][0].path).toBe('/root/readme.md');
  });

  it('deletes a file via the context menu after confirmation', async () => {
    tree.mockResolvedValue(sample);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FileTree rootPath="/root" />);

    fireEvent.contextMenu(await screen.findByText('readme.md'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(remove).toHaveBeenCalledWith('/root/readme.md');
    confirmSpy.mockRestore();
  });

  it('creates a new file from the context menu', async () => {
    tree.mockResolvedValue(sample);
    render(<FileTree rootPath="/root" />);

    fireEvent.contextMenu(await screen.findByText('src')); // a directory
    fireEvent.click(screen.getByRole('menuitem', { name: 'New File…' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x.ts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(create).toHaveBeenCalledWith('/root/src/x.ts', 'file');
  });

  it('offers root New File/New Folder when the empty explorer area is clicked', async () => {
    tree.mockResolvedValue(sample);
    render(<FileTree rootPath="/root" />);
    await screen.findByText('readme.md'); // tree loaded

    // Click empty space (the scroll container, not a row) → root menu.
    fireEvent.click(screen.getByLabelText('File tree'));
    expect(screen.getByRole('menuitem', { name: 'New File…' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Folder…' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pkg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(create).toHaveBeenCalledWith('/root/pkg', 'directory'); // created at ROOT
  });

  it('moves a file into a folder via drag & drop', async () => {
    tree.mockResolvedValue(sample);
    render(<FileTree rootPath="/root" />);
    const folderBtn = (await screen.findByText('src')).closest('button')!;

    fireEvent.drop(folderBtn, {
      dataTransfer: { getData: () => '/root/readme.md', types: ['text/strix-path'] },
    });
    expect(rename).toHaveBeenCalledWith('/root/readme.md', '/root/src/readme.md');
  });

  it('moves via the drag ref even when dataTransfer.getData is empty (Electron quirk)', async () => {
    tree.mockResolvedValue(sample);
    render(<FileTree rootPath="/root" />);
    const fileBtn = (await screen.findByText('readme.md')).closest('button')!;
    const folderBtn = (await screen.findByText('src')).closest('button')!;

    // dragstart records the source in module state; the drop's dataTransfer
    // returns '' (the real-world failure) yet the move still lands.
    fireEvent.dragStart(fileBtn, { dataTransfer: { setData: () => {}, effectAllowed: '' } });
    fireEvent.drop(folderBtn, { dataTransfer: { getData: () => '', types: [] } });
    expect(rename).toHaveBeenCalledWith('/root/readme.md', '/root/src/readme.md');
  });

  it('ignores a drop of a folder into itself', async () => {
    tree.mockResolvedValue(sample);
    render(<FileTree rootPath="/root" />);
    const folderBtn = (await screen.findByText('src')).closest('button')!;

    fireEvent.drop(folderBtn, {
      dataTransfer: { getData: () => '/root/src', types: ['text/strix-path'] },
    });
    expect(rename).not.toHaveBeenCalled();
  });
});
