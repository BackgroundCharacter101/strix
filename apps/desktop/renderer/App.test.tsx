// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { makeStrixApi } from './test-utils';
import type { FileNode } from '../main/fs';
import type { GitStatus } from '../main/git';

const root = vi.fn<[], Promise<string>>();
const tree = vi.fn<[string], Promise<FileNode>>();
const read = vi.fn<[string], Promise<string>>();
const gitStatus = vi.fn<[string], Promise<GitStatus>>();

beforeEach(() => {
  root.mockReset();
  tree.mockReset();
  read.mockReset();
  gitStatus.mockReset();
  gitStatus.mockResolvedValue({ isRepo: true, branch: 'main', files: [] });
  window.strix = makeStrixApi({
    fs: { tree, read, write: vi.fn<[string, string], Promise<void>>() },
    workspace: { root },
    git: { status: gitStatus },
  });
});

describe('App', () => {
  it('exports a React component function', () => {
    expect(typeof App).toBe('function');
  });

  it('loads the workspace root and renders its file tree', async () => {
    root.mockResolvedValue('/ws');
    tree.mockResolvedValue({
      name: 'ws',
      path: '/ws',
      type: 'directory',
      children: [{ name: 'a.ts', path: '/ws/a.ts', type: 'file' }],
    });

    render(<App />);

    expect(await screen.findByText('a.ts')).toBeInTheDocument();
    expect(root).toHaveBeenCalled();
    expect(tree).toHaveBeenCalledWith('/ws');
  });

  it('opens a file in the viewer when clicked in the tree', async () => {
    root.mockResolvedValue('/ws');
    tree.mockResolvedValue({
      name: 'ws',
      path: '/ws',
      type: 'directory',
      children: [{ name: 'a.ts', path: '/ws/a.ts', type: 'file' }],
    });
    read.mockResolvedValue('export const a = 1;');

    render(<App />);
    fireEvent.click(await screen.findByText('a.ts'));

    expect(await screen.findByDisplayValue('export const a = 1;')).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith('/ws/a.ts');
  });

  it('shows the git branch and dirty count for the workspace', async () => {
    root.mockResolvedValue('/ws');
    tree.mockResolvedValue({ name: 'ws', path: '/ws', type: 'directory', children: [] });
    gitStatus.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      files: [{ path: 'a.ts', status: 'modified', staged: false }],
    });

    render(<App />);

    await waitFor(() => {
      const bar = screen.getByLabelText('git status');
      expect(bar).toHaveTextContent('main');
      expect(bar).toHaveTextContent('1 changed');
    });
    expect(gitStatus).toHaveBeenCalledWith('/ws');
  });
});
