import { contextBridge, ipcRenderer } from 'electron';
import type { FileNode } from './fs';

export interface StrixFsApi {
  read(filePath: string): Promise<string>;
  write(filePath: string, content: string): Promise<void>;
  tree(rootPath: string): Promise<FileNode>;
}

export interface StrixWorkspaceApi {
  root(): Promise<string>;
}

export interface StrixApi {
  fs: StrixFsApi;
  workspace: StrixWorkspaceApi;
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
};

contextBridge.exposeInMainWorld('strix', api);
