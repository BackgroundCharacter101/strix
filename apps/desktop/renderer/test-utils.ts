import { vi } from 'vitest';
import type { StrixApi } from '../main/bridge';
import type { FileNode } from '../main/fs';
import type { GitStatus } from '../main/git';

interface StrixApiOverrides {
  fs?: Partial<StrixApi['fs']>;
  workspace?: Partial<StrixApi['workspace']>;
  github?: Partial<StrixApi['github']>;
  git?: Partial<StrixApi['git']>;
  terminal?: Partial<StrixApi['terminal']>;
  lsp?: Partial<StrixApi['lsp']>;
  ai?: Partial<StrixApi['ai']>;
  collab?: Partial<StrixApi['collab']>;
  serve?: Partial<StrixApi['serve']>;
  search?: Partial<StrixApi['search']>;
  menu?: Partial<StrixApi['menu']>;
  win?: Partial<StrixApi['win']>;
  update?: Partial<StrixApi['update']>;
  preview?: Partial<StrixApi['preview']>;
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
      readDir: vi.fn(async (): Promise<FileNode[]> => []),
      setExcludes: vi.fn(async (): Promise<void> => {}),
      create: vi.fn(async (): Promise<void> => {}),
      rename: vi.fn(async (): Promise<void> => {}),
      remove: vi.fn(async (): Promise<void> => {}),
      watch: vi.fn(),
      onChanged: vi.fn(() => () => {}),
    },
    github: {
      user: vi.fn(async () => null),
      connect: vi.fn(async () => ({ ok: false, error: 'no token' })),
      disconnect: vi.fn(async () => {}),
      repos: vi.fn(async () => []),
      deviceStart: vi.fn(async () => ({
        deviceCode: '',
        userCode: 'XXXX-XXXX',
        verificationUri: 'https://github.com/login/device',
        interval: 5,
        expiresIn: 900,
      })),
      deviceWait: vi.fn(async () => ({ ok: false, error: 'no client id' })),
    },
    workspace: {
      root: vi.fn(async (): Promise<string> => '/'),
      open: vi.fn(async (): Promise<string | null> => null),
      openFile: vi.fn(async (): Promise<string | null> => null),
      clone: vi.fn(async (): Promise<string | null> => null),
      newProject: vi.fn(async (): Promise<string | null> => null),
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
      listBranches: vi.fn(async () => ({ current: null, branches: [] })),
      checkout: vi.fn(async (): Promise<void> => {}),
      createBranch: vi.fn(async (): Promise<void> => {}),
      log: vi.fn(async () => []),
      pull: vi.fn(async () => ({ ok: true, output: '' })),
      push: vi.fn(async () => ({ ok: true, output: '' })),
      sync: vi.fn(async () => ({ ok: true, output: '' })),
    },
    terminal: {
      create: vi.fn(async (): Promise<string> => 'term-1'),
      input: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
      hasCommand: vi.fn(async (): Promise<boolean> => false),
      exec: vi.fn(async () => ({ exitCode: 0, output: '' })),
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
      ensure: vi.fn(async (): Promise<void> => {}),
      config: vi.fn(async () => ({ baseURL: 'http://localhost:3001/v1', apiKey: 'test-key' })),
      models: vi.fn(async (): Promise<string[]> => ['auto']),
      listKeys: vi.fn(async () => []),
      addKey: vi.fn(async () => ({ ok: true })),
      deleteKey: vi.fn(async () => ({ ok: true })),
      detectLocal: vi.fn(async () => []),
      directStart: vi.fn(),
      directCancel: vi.fn(),
      onDirectToken: vi.fn(() => () => {}),
      onDirectDone: vi.fn(() => () => {}),
      onDirectError: vi.fn(() => () => {}),
      freellmStart: vi.fn(),
      freellmCancel: vi.fn(),
      onFreellmToken: vi.fn(() => () => {}),
      onFreellmDone: vi.fn(() => () => {}),
      onFreellmError: vi.fn(() => () => {}),
    },
    collab: {
      url: vi.fn(async (): Promise<string | null> => null),
    },
    serve: {
      start: vi.fn(async () => ({ url: 'http://127.0.0.1:0', port: 0, root: '/' })),
      stop: vi.fn(async (): Promise<void> => {}),
      info: vi.fn(async () => null),
    },
    search: {
      find: vi.fn(async () => []),
      replace: vi.fn(async () => ({ files: 0, occurrences: 0, changed: [] })),
      start: vi.fn(),
      cancel: vi.fn(),
      onMatch: vi.fn(() => () => {}),
      onDone: vi.fn(() => () => {}),
    },
    menu: {
      onCommand: vi.fn(() => () => {}),
    },
    win: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      setFullScreen: vi.fn(),
      openExternal: vi.fn(),
      isMaximized: vi.fn(async (): Promise<boolean> => false),
      onMaximizeChange: vi.fn(() => () => {}),
      popupMenu: vi.fn(),
    },
    update: {
      check: vi.fn(async () => ({ available: false, current: '0.1.0' })),
      download: vi.fn(async () => ({ ok: true })),
      apply: vi.fn(async () => ({ ok: true })),
      onAvailable: vi.fn(() => () => {}),
      onProgress: vi.fn(() => () => {}),
      onReady: vi.fn(() => () => {}),
      onError: vi.fn(() => () => {}),
    },
    preview: {
      start: vi.fn(async () => ({ running: true, url: null, command: 'npm run dev', root: '/ws' })),
      stop: vi.fn(async () => {}),
      status: vi.fn(async () => ({ running: false, url: null, command: null, root: null })),
      onUrl: vi.fn(() => () => {}),
      onLog: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
    },
  };

  return {
    fs: { ...base.fs, ...overrides.fs },
    workspace: { ...base.workspace, ...overrides.workspace },
    github: { ...base.github, ...overrides.github },
    git: { ...base.git, ...overrides.git },
    terminal: { ...base.terminal, ...overrides.terminal },
    lsp: { ...base.lsp, ...overrides.lsp },
    ai: { ...base.ai, ...overrides.ai },
    collab: { ...base.collab, ...overrides.collab },
    serve: { ...base.serve, ...overrides.serve },
    search: { ...base.search, ...overrides.search },
    menu: { ...base.menu, ...overrides.menu },
    win: { ...base.win, ...overrides.win },
    update: { ...base.update, ...overrides.update },
    preview: { ...base.preview, ...overrides.preview },
  };
}
