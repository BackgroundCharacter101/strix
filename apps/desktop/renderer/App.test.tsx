// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import type { FileNode } from '../main/fs';

const root = vi.fn<[], Promise<string>>();
const tree = vi.fn<[string], Promise<FileNode>>();
const read = vi.fn<[string], Promise<string>>();

beforeEach(() => {
  root.mockReset();
  tree.mockReset();
  read.mockReset();
  window.strix = {
    fs: {
      tree,
      read,
      write: vi.fn<[string, string], Promise<void>>(),
    },
    workspace: { root },
  };
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
});
