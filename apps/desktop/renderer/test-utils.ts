import { vi } from 'vitest';
import type { StrixApi } from '../main/bridge';
import type { FileNode } from '../main/fs';
import type { GitStatus } from '../main/git';

interface StrixApiOverrides {
  fs?: Partial<StrixApi['fs']>;
  workspace?: Partial<StrixApi['workspace']>;
  git?: Partial<StrixApi['git']>;
  terminal?: Partial<StrixApi['terminal']>;
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
    },
    workspace: { root: vi.fn(async (): Promise<string> => '/') },
    git: {
      status: vi.fn(
        async (): Promise<GitStatus> => ({ isRepo: false, branch: null, files: [] }),
      ),
    },
    terminal: {
      create: vi.fn(async (): Promise<string> => 'term-1'),
      input: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
    },
  };

  return {
    fs: { ...base.fs, ...overrides.fs },
    workspace: { ...base.workspace, ...overrides.workspace },
    git: { ...base.git, ...overrides.git },
    terminal: { ...base.terminal, ...overrides.terminal },
  };
}
