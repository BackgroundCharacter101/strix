import { contextBridge, ipcRenderer } from 'electron';
import type { FileNode } from './fs';

export interface TabeaFsApi {
  read(filePath: string): Promise<string>;
  write(filePath: string, content: string): Promise<void>;
  tree(rootPath: string): Promise<FileNode>;
}

export interface TabeaWorkspaceApi {
  root(): Promise<string>;
}

export interface TabeaApi {
  fs: TabeaFsApi;
  workspace: TabeaWorkspaceApi;
}

const api: TabeaApi = {
  fs: {
    read: (filePath) => ipcRenderer.invoke('file:read', filePath),
    write: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
    tree: (rootPath) => ipcRenderer.invoke('file:tree', rootPath),
  },
  workspace: {
    root: () => ipcRenderer.invoke('workspace:root'),
  },
};

contextBridge.exposeInMainWorld('tabea', api);
