import type { FileNode } from './fs';
import type { GitStatus } from './git';
import type { TerminalCreateOptions } from './terminal';
import type { Language, JsonRpcMessage } from './lsp';

// Shape of the API exposed to the renderer via contextBridge (window.strix).
// Kept separate from preload so renderer code can import these types without
// depending on the preload module's format/extension.
export interface StrixFsApi {
  read(filePath: string): Promise<string>;
  write(filePath: string, content: string): Promise<void>;
  tree(rootPath: string): Promise<FileNode>;
}

export interface StrixWorkspaceApi {
  root(): Promise<string>;
}

export interface StrixGitApi {
  status(rootPath: string): Promise<GitStatus>;
}

export interface StrixTerminalApi {
  create(opts?: TerminalCreateOptions): Promise<string>;
  input(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): void;
  onData(cb: (e: { id: string; data: string }) => void): () => void;
  onExit(cb: (e: { id: string; exitCode: number }) => void): () => void;
}

export interface StrixLspApi {
  start(language: Language): Promise<string>;
  send(id: string, message: JsonRpcMessage): void;
  stop(id: string): void;
  onMessage(cb: (e: { id: string; message: JsonRpcMessage }) => void): () => void;
}

export interface StrixAiApi {
  config(): Promise<{ baseURL: string; apiKey: string }>;
  models(): Promise<string[]>;
}

export interface StrixCollabApi {
  url(): Promise<string | null>;
}

export interface StrixApi {
  fs: StrixFsApi;
  workspace: StrixWorkspaceApi;
  git: StrixGitApi;
  terminal: StrixTerminalApi;
  lsp: StrixLspApi;
  ai: StrixAiApi;
  collab: StrixCollabApi;
}
