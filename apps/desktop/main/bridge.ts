import type { FileNode } from './fs';
import type { GitStatus } from './git';
import type { SearchMatch } from './search';
import type { TerminalCreateOptions } from './terminal';
import type { Language, JsonRpcMessage } from './lsp';

// Shape of the API exposed to the renderer via contextBridge (window.strix).
// Kept separate from preload so renderer code can import these types without
// depending on the preload module's format/extension.
export interface StrixFsApi {
  read(filePath: string): Promise<string>;
  write(filePath: string, content: string): Promise<void>;
  tree(rootPath: string): Promise<FileNode>;
  create(targetPath: string, type: 'file' | 'directory'): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(targetPath: string): Promise<void>;
}

export interface StrixWorkspaceApi {
  root(): Promise<string>;
  // Opens a native folder picker; sets and returns the new root, or null if cancelled.
  open(): Promise<string | null>;
  // Opens a native file picker; returns the chosen file path, or null if cancelled.
  openFile(): Promise<string | null>;
  // Clones a git repo into a chosen parent dir; returns the new repo root, or null.
  clone(url: string): Promise<string | null>;
}

export interface StrixGitApi {
  status(rootPath: string): Promise<GitStatus>;
  fileHead(filePath: string): Promise<string>;
}

export interface StrixTerminalApi {
  create(opts?: TerminalCreateOptions): Promise<string>;
  input(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): void;
  onData(cb: (e: { id: string; data: string }) => void): () => void;
  onExit(cb: (e: { id: string; exitCode: number }) => void): () => void;
  // Whether an executable (e.g. `claude`) is available on PATH.
  hasCommand(command: string): Promise<boolean>;
}

export interface StrixLspApi {
  start(language: Language): Promise<string>;
  send(id: string, message: JsonRpcMessage): void;
  stop(id: string): void;
  onMessage(cb: (e: { id: string; message: JsonRpcMessage }) => void): () => void;
  // Whether a language-server command is installed on PATH.
  hasServer(command: string): Promise<boolean>;
  // Install a language server by registry id (main runs a vetted command).
  installServer(id: string): Promise<{ ok: boolean; output: string }>;
}

export interface StrixAiApi {
  config(): Promise<{ baseURL: string; apiKey: string }>;
  models(): Promise<string[]>;
}

export interface StrixCollabApi {
  url(): Promise<string | null>;
}

export interface StrixSearchApi {
  find(query: string): Promise<SearchMatch[]>;
}

export interface StrixMenuApi {
  // Subscribe to native-menu commands (id matches the command palette). Returns an unsubscribe.
  onCommand(cb: (id: string) => void): () => void;
}

// Window controls for the custom (frameless) title bar.
export interface StrixWindowApi {
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  onMaximizeChange(cb: (maximized: boolean) => void): () => void;
  // Pop a top-level application menu (by label) at the given screen-relative point.
  popupMenu(label: string, x: number, y: number): void;
}

export interface StrixApi {
  fs: StrixFsApi;
  workspace: StrixWorkspaceApi;
  git: StrixGitApi;
  terminal: StrixTerminalApi;
  lsp: StrixLspApi;
  ai: StrixAiApi;
  collab: StrixCollabApi;
  search: StrixSearchApi;
  menu: StrixMenuApi;
  win: StrixWindowApi;
}
