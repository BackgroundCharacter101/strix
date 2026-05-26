// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTree, fileBadge } from './FileTree';
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
    fireEvent.change(screen.getByLabelText('New file name'), { target: { value: 'x.ts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(create).toHaveBeenCalledWith('/root/src/x.ts', 'file');
  });
});
