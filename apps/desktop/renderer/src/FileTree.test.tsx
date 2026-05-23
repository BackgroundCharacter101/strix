// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTree } from './FileTree';
import type { FileNode } from '../../main/fs';

const tree = vi.fn<[string], Promise<FileNode>>();
const read = vi.fn<[string], Promise<string>>();
const write = vi.fn<[string, string], Promise<void>>();

const root = vi.fn<[], Promise<string>>();

beforeEach(() => {
  tree.mockReset();
  window.tabea = { fs: { tree, read, write }, workspace: { root } };
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

describe('FileTree', () => {
  it('loads the tree for the given root and renders nested nodes', async () => {
    tree.mockResolvedValue(sample);
    render(<FileTree rootPath="/root" />);

    expect(await screen.findByText('index.ts')).toBeInTheDocument();
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('readme.md')).toBeInTheDocument();
    expect(tree).toHaveBeenCalledWith('/root');
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

    fireEvent.click(await screen.findByText('index.ts'));

    expect(onSelectFile).toHaveBeenCalledTimes(1);
    expect(onSelectFile.mock.calls[0][0].path).toBe('/root/src/index.ts');
  });
});
