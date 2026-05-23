import { contextBridge, ipcRenderer } from 'electron';
import type { FileNode } from './fs';
import type { GitStatus } from './git';

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

export interface StrixApi {
  fs: StrixFsApi;
  workspace: StrixWorkspaceApi;
  git: StrixGitApi;
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
};

contextBridge.exposeInMainWorld('strix', api);
