// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
// xterm can't render in jsdom; stub the Terminal component.
vi.mock('./src/Terminal', () => ({ Terminal: () => <div aria-label="terminal" /> }));
// monaco-setup imports monaco-editor (no jsdom entry); stub the accent applier.
vi.mock('./src/monaco-setup', () => ({ applyAccent: vi.fn() }));

// Monaco can't render in jsdom; stub the editor so FileViewer yields a textarea.
vi.mock('@strix/editor', () => ({
  languageForPath: () => 'plaintext',
  CodeEditor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea
      aria-label="File contents"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
  DiffViewer: () => <div aria-label="diff" />,
}));

import App from './App';
import { makeStrixApi } from './test-utils';
import type { FileNode } from '../main/fs';
import type { GitStatus } from '../main/git';

const root = vi.fn<[], Promise<string>>();
const tree = vi.fn<[string], Promise<FileNode>>();
const read = vi.fn<[string], Promise<string>>();
const gitStatus = vi.fn<[string], Promise<GitStatus>>();

beforeEach(() => {
  localStorage.clear(); // isolate persisted state (settings, recent folders, …)
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

  it('toggles the file-tree sidebar from the activity bar', async () => {
    root.mockResolvedValue('/ws');
    tree.mockResolvedValue({ name: 'ws', path: '/ws', type: 'directory', children: [] });

    render(<App />);
    expect(await screen.findByText('ws')).toBeInTheDocument(); // root folder in the tree

    fireEvent.click(screen.getByRole('button', { name: 'Explorer' }));
    expect(screen.queryByText('ws')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Explorer' }));
    expect(await screen.findByText('ws')).toBeInTheDocument();
  });

  it('splits the editor into two groups with Ctrl+\\', async () => {
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

    // Split → the active file is mirrored into a second group.
    fireEvent.keyDown(window, { key: '\\', ctrlKey: true });
    await waitFor(() =>
      expect(screen.getAllByDisplayValue('export const a = 1;')).toHaveLength(2),
    );

    // Toggle off → back to one group.
    fireEvent.keyDown(window, { key: '\\', ctrlKey: true });
    await waitFor(() =>
      expect(screen.getAllByDisplayValue('export const a = 1;')).toHaveLength(1),
    );
  });

  it('toggles the sidebar with the Ctrl+B shortcut', async () => {
    root.mockResolvedValue('/ws');
    tree.mockResolvedValue({ name: 'ws', path: '/ws', type: 'directory', children: [] });

    render(<App />);
    expect(await screen.findByText('ws')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(screen.queryByText('ws')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(await screen.findByText('ws')).toBeInTheDocument();
  });

  it('routes native menu commands to the matching action', async () => {
    root.mockResolvedValue('/ws');
    tree.mockResolvedValue({ name: 'ws', path: '/ws', type: 'directory', children: [] });
    // Capture the menu-command callback the app registers on mount.
    let fire: ((id: string) => void) | undefined;
    const onCommand = vi.fn((cb: (id: string) => void) => {
      fire = cb;
      return () => {};
    });
    window.strix = makeStrixApi({
      fs: { tree, read, write: vi.fn<[string, string], Promise<void>>() },
      workspace: { root },
      git: { status: gitStatus },
      menu: { onCommand },
    });

    render(<App />);
    expect(await screen.findByText('ws')).toBeInTheDocument();

    // The menu's "Explorer" command toggles the (already-open) sidebar off.
    act(() => fire?.('view.explorer'));
    expect(screen.queryByText('ws')).not.toBeInTheDocument();
  });

  it('runs a command from the Ctrl+Shift+P palette', async () => {
    root.mockResolvedValue('/ws');
    tree.mockResolvedValue({ name: 'ws', path: '/ws', type: 'directory', children: [] });

    render(<App />);
    expect(await screen.findByText('ws')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true });
    const input = await screen.findByLabelText('Type a command…');
    fireEvent.change(input, { target: { value: 'View: Explorer' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // The command hid the sidebar (Explorer was already active → toggled off).
    expect(screen.queryByText('ws')).not.toBeInTheDocument();
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
