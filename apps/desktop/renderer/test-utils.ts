import { vi } from 'vitest';
import type { StrixApi } from '../main/bridge';
import type { FileNode } from '../main/fs';
import type { GitStatus } from '../main/git';

interface StrixApiOverrides {
  fs?: Partial<StrixApi['fs']>;
  workspace?: Partial<StrixApi['workspace']>;
  git?: Partial<StrixApi['git']>;
  terminal?: Partial<StrixApi['terminal']>;
  lsp?: Partial<StrixApi['lsp']>;
  ai?: Partial<StrixApi['ai']>;
  collab?: Partial<StrixApi['collab']>;
  search?: Partial<StrixApi['search']>;
  menu?: Partial<StrixApi['menu']>;
  win?: Partial<StrixApi['win']>;
}

// Builds a complete fake StrixApi with no-op defaults. Tests pass section
// overrides (their own vi.fn mocks) for whatever they actually exercise; this
// keeps the single source of truth for the bridge shape in one place.
export function makeStrixApi(overrides: StrixApiOverrides = {}): StrixApi {
  const base: StrixApi = {
    fs: {
      read: vi.fn(async (): Promise<string> => ''),
      write: vi.fn(async (): Promise<void> => {}),
      tree: vi.fn(
        async (): Promise<FileNode> => ({ name: '', path: '', type: 'directory', children: [] }),
      ),
      create: vi.fn(async (): Promise<void> => {}),
      rename: vi.fn(async (): Promise<void> => {}),
      remove: vi.fn(async (): Promise<void> => {}),
    },
    workspace: {
      root: vi.fn(async (): Promise<string> => '/'),
      open: vi.fn(async (): Promise<string | null> => null),
      openFile: vi.fn(async (): Promise<string | null> => null),
      clone: vi.fn(async (): Promise<string | null> => null),
    },
    git: {
      status: vi.fn(
        async (): Promise<GitStatus> => ({ isRepo: false, branch: null, files: [] }),
      ),
      fileHead: vi.fn(async (): Promise<string> => ''),
      stage: vi.fn(async (): Promise<void> => {}),
      unstage: vi.fn(async (): Promise<void> => {}),
      stageAll: vi.fn(async (): Promise<void> => {}),
      commit: vi.fn(async (): Promise<string> => 'oid'),
      diffStaged: vi.fn(async (): Promise<string> => ''),
      createPr: vi.fn(async () => ({ url: null, pushed: false, branch: null })),
    },
    terminal: {
      create: vi.fn(async (): Promise<string> => 'term-1'),
      input: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
      hasCommand: vi.fn(async (): Promise<boolean> => false),
    },
    lsp: {
      start: vi.fn(async (): Promise<string> => 'lsp-1'),
      send: vi.fn(),
      stop: vi.fn(),
      onMessage: vi.fn(() => () => {}),
      hasServer: vi.fn(async (): Promise<boolean> => false),
      installServer: vi.fn(async () => ({ ok: true, output: '' })),
      uninstallServer: vi.fn(async () => ({ ok: true, output: '' })),
    },
    ai: {
      config: vi.fn(async () => ({ baseURL: 'http://localhost:3001/v1', apiKey: 'test-key' })),
      models: vi.fn(async (): Promise<string[]> => ['auto']),
    },
    collab: {
      url: vi.fn(async (): Promise<string | null> => null),
    },
    search: {
      find: vi.fn(async () => []),
    },
    menu: {
      onCommand: vi.fn(() => () => {}),
    },
    win: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      setFullScreen: vi.fn(),
      isMaximized: vi.fn(async (): Promise<boolean> => false),
      onMaximizeChange: vi.fn(() => () => {}),
      popupMenu: vi.fn(),
    },
  };

  return {
    fs: { ...base.fs, ...overrides.fs },
    workspace: { ...base.workspace, ...overrides.workspace },
    git: { ...base.git, ...overrides.git },
    terminal: { ...base.terminal, ...overrides.terminal },
    lsp: { ...base.lsp, ...overrides.lsp },
    ai: { ...base.ai, ...overrides.ai },
    collab: { ...base.collab, ...overrides.collab },
    search: { ...base.search, ...overrides.search },
    menu: { ...base.menu, ...overrides.menu },
    win: { ...base.win, ...overrides.win },
  };
}
