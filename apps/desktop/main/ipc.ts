import { ipcMain } from 'electron';
import {
  buildFileTree,
  readFileContents,
  writeFileContents,
  createEntry,
  renameEntry,
  removeEntry,
} from './fs.js';
import { getGitStatus, getFileHeadContent } from './git.js';
import {
  getRoot,
  openFolderDialog,
  openFileDialog,
  cloneRepo,
} from './workspace.js';
import { BrowserWindow } from 'electron';
import { searchInFiles } from './search.js';
import { TerminalManager, type TerminalCreateOptions } from './terminal.js';
import { LspManager, type Language, type JsonRpcMessage } from './lsp.js';
import { commandExists } from './commandExists.js';
import { installServer } from './languageServers.js';

// Maps the file:*, workspace:*, git:*, and terminal:* channels
// (ARCHITECTURE §6.7) to the corresponding main-process services.
export function registerIpcHandlers(): void {
  ipcMain.handle('file:read', (_event, filePath: string) => readFileContents(filePath));
  ipcMain.handle('file:write', (_event, filePath: string, content: string) =>
    writeFileContents(filePath, content),
  );
  ipcMain.handle('file:tree', (_event, rootPath: string) => buildFileTree(rootPath));
  ipcMain.handle('file:create', (_event, targetPath: string, type: 'file' | 'directory') =>
    createEntry(targetPath, type),
  );
  ipcMain.handle('file:rename', (_event, from: string, to: string) => renameEntry(from, to));
  ipcMain.handle('file:remove', (_event, targetPath: string) => removeEntry(targetPath));
  ipcMain.handle('workspace:root', () => getRoot());
  ipcMain.handle('workspace:open', (event) =>
    openFolderDialog(BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle('workspace:openFile', (event) =>
    openFileDialog(BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle('workspace:clone', (event, url: string) =>
    cloneRepo(BrowserWindow.fromWebContents(event.sender), url),
  );
  ipcMain.handle('search:find', (_event, query: string) => searchInFiles(getRoot(), query));
  ipcMain.handle('git:status', (_event, rootPath: string) => getGitStatus(rootPath));
  ipcMain.handle('git:fileHead', (_event, filePath: string) => getFileHeadContent(filePath));

  const terminals = new TerminalManager();
  ipcMain.handle('terminal:create', (event, opts: TerminalCreateOptions) =>
    terminals.create(
      opts,
      (id, data) => event.sender.send('terminal:data', { id, data }),
      (id, exitCode) => event.sender.send('terminal:exit', { id, exitCode }),
    ),
  );
  ipcMain.on('terminal:input', (_event, { id, data }: { id: string; data: string }) =>
    terminals.write(id, data),
  );
  ipcMain.on(
    'terminal:resize',
    (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) =>
      terminals.resize(id, cols, rows),
  );
  ipcMain.on('terminal:kill', (_event, { id }: { id: string }) => terminals.kill(id));
  ipcMain.handle('terminal:hasCommand', (_event, command: string) => commandExists(command));

  const lsp = new LspManager();
  ipcMain.handle('lsp:start', (event, language: Language) =>
    lsp.start(language, {}, (id, message) => event.sender.send('lsp:message', { id, message })),
  );
  ipcMain.on(
    'lsp:send',
    (_event, { id, message }: { id: string; message: JsonRpcMessage }) => lsp.send(id, message),
  );
  ipcMain.on('lsp:stop', (_event, { id }: { id: string }) => lsp.stop(id));
  ipcMain.handle('lsp:hasServer', (_event, command: string) => commandExists(command));
  ipcMain.handle('lsp:installServer', (_event, id: string) => installServer(id));

  // --- AI: bridge the renderer to the local FreeLLMAPI server ---
  const aiPort = process.env.FREELLMAPI_PORT ?? '3001';
  const aiBase = `http://localhost:${aiPort}`;

  const fetchKey = async (): Promise<string> => {
    const res = await fetch(`${aiBase}/api/settings/api-key`);
    const body = (await res.json()) as { apiKey: string };
    return body.apiKey;
  };

  ipcMain.handle('ai:config', async () => {
    try {
      return { baseURL: `${aiBase}/v1`, apiKey: await fetchKey() };
    } catch {
      return { baseURL: `${aiBase}/v1`, apiKey: '' };
    }
  });

  // Collaboration is opt-in: set COLLAB_SERVER_URL to enable (off by default).
  ipcMain.handle('collab:url', () => process.env.COLLAB_SERVER_URL ?? null);

  ipcMain.handle('ai:models', async () => {
    try {
      const apiKey = await fetchKey();
      const res = await fetch(`${aiBase}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = (await res.json()) as { data?: { id: string }[] };
      const ids = (body.data ?? []).map((m) => m.id).filter((id) => id !== 'auto');
      return ['auto', ...ids];
    } catch {
      return ['auto'];
    }
  });
}
