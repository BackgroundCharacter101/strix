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
    fileHead: (filePath) => ipcRenderer.invoke('git:fileHead', filePath),
    stage: (rootPath, filepath) => ipcRenderer.invoke('git:stage', rootPath, filepath),
    unstage: (rootPath, filepath) => ipcRenderer.invoke('git:unstage', rootPath, filepath),
    stageAll: (rootPath) => ipcRenderer.invoke('git:stageAll', rootPath),
    commit: (rootPath, message) => ipcRenderer.invoke('git:commit', rootPath, message),
    diffStaged: (rootPath) => ipcRenderer.invoke('git:diffStaged', rootPath),
    createPr: (rootPath) => ipcRenderer.invoke('git:createPr', rootPath),
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
    hasCommand: (command) => ipcRenderer.invoke('terminal:hasCommand', command),
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
    hasServer: (command) => ipcRenderer.invoke('lsp:hasServer', command),
    installServer: (id) => ipcRenderer.invoke('lsp:installServer', id),
    uninstallServer: (id) => ipcRenderer.invoke('lsp:uninstallServer', id),
  },
  ai: {
    config: (url) => ipcRenderer.invoke('ai:config', url),
    models: (url) => ipcRenderer.invoke('ai:models', url),
  },
  collab: {
    url: () => ipcRenderer.invoke('collab:url'),
  },
  search: {
    find: (query) => ipcRenderer.invoke('search:find', query),
  },
  menu: {
    onCommand: (cb) => {
      const handler = (_event: unknown, id: string) => cb(id);
      ipcRenderer.on('menu:command', handler);
      return () => ipcRenderer.removeListener('menu:command', handler);
    },
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggleMaximize'),
    close: () => ipcRenderer.send('win:close'),
    setFullScreen: (on) => ipcRenderer.send('win:setFullScreen', on),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    onMaximizeChange: (cb) => {
      const handler = (_event: unknown, maximized: boolean) => cb(maximized);
      ipcRenderer.on('win:maximized', handler);
      return () => ipcRenderer.removeListener('win:maximized', handler);
    },
    popupMenu: (label, x, y) => ipcRenderer.send('win:popupMenu', { label, x, y }),
  },
};

contextBridge.exposeInMainWorld('strix', api);
