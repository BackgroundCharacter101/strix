import { contextBridge, ipcRenderer } from 'electron';
import type { StrixApi } from './bridge';

const api: StrixApi = {
  fs: {
    read: (filePath) => ipcRenderer.invoke('file:read', filePath),
    write: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
    tree: (rootPath) => ipcRenderer.invoke('file:tree', rootPath),
    create: (targetPath, type) => ipcRenderer.invoke('file:create', targetPath, type),
    rename: (from, to) => ipcRenderer.invoke('file:rename', from, to),
    remove: (targetPath) => ipcRenderer.invoke('file:remove', targetPath),
  },
  workspace: {
    root: () => ipcRenderer.invoke('workspace:root'),
    open: () => ipcRenderer.invoke('workspace:open'),
    openFile: () => ipcRenderer.invoke('workspace:openFile'),
    clone: (url) => ipcRenderer.invoke('workspace:clone', url),
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
  lsp: {
    start: (language) => ipcRenderer.invoke('lsp:start', language),
    send: (id, message) => ipcRenderer.send('lsp:send', { id, message }),
    stop: (id) => ipcRenderer.send('lsp:stop', { id }),
    onMessage: (cb) => {
      const handler = (_event: unknown, e: { id: string; message: Record<string, unknown> }) =>
        cb(e);
      ipcRenderer.on('lsp:message', handler);
      return () => ipcRenderer.removeListener('lsp:message', handler);
    },
  },
  ai: {
    config: () => ipcRenderer.invoke('ai:config'),
    models: () => ipcRenderer.invoke('ai:models'),
  },
  collab: {
    url: () => ipcRenderer.invoke('collab:url'),
  },
  search: {
    find: (query) => ipcRenderer.invoke('search:find', query),
  },
};

contextBridge.exposeInMainWorld('strix', api);
