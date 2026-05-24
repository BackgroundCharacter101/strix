import { contextBridge, ipcRenderer } from 'electron';
import type { FileNode } from './fs';
import type { GitStatus } from './git';
import type { TerminalCreateOptions } from './terminal';

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

export interface StrixApi {
  fs: StrixFsApi;
  workspace: StrixWorkspaceApi;
  git: StrixGitApi;
  terminal: StrixTerminalApi;
}

const api: StrixApi = {
  fs: {
    read: (filePath) => ipcRenderer.invoke('file:read', filePath),
    write: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
    tree: (rootPath) => ipcRenderer.invoke('file:tree', rootPath),
  },
  workspace: {
    root: () => ipcRenderer.invoke('workspace:root'),
  },
  git: {
    status: (rootPath) => ipcRenderer.invoke('git:status', rootPath),
  },
  terminal: {
    create: (opts) => ipcRenderer.invoke('terminal:create', opts),
    input: (id, data) => ipcRenderer.send('terminal:input', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
    kill: (id) => ipcRenderer.send('terminal:kill', { id }),
    onData: (cb) => {
      const handler = (_event: unknown, e: { id: string; data: string }) => cb(e);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
    onExit: (cb) => {
      const handler = (_event: unknown, e: { id: string; exitCode: number }) => cb(e);
      ipcRenderer.on('terminal:exit', handler);
      return () => ipcRenderer.removeListener('terminal:exit', handler);
    },
  },
};

contextBridge.exposeInMainWorld('strix', api);
