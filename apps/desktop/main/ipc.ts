import { ipcMain, shell } from 'electron';
import {
  buildFileTree,
  readFileContents,
  writeFileContents,
  createEntry,
  renameEntry,
  removeEntry,
} from './fs.js';
import {
  getGitStatus,
  getFileHeadContent,
  stageFile,
  unstageFile,
  stageAll,
  commit,
  getStagedDiff,
  createPullRequest,
} from './git.js';
import {
  getRoot,
  openFolderDialog,
  openFileDialog,
  cloneRepo,
} from './workspace.js';
import { BrowserWindow } from 'electron';
import { searchInFiles } from './search.js';
import { popupMenu } from './menu.js';
import { TerminalManager, type TerminalCreateOptions } from './terminal.js';
import { LspManager, type Language, type JsonRpcMessage } from './lsp.js';
import { commandExists } from './commandExists.js';
import { installServer, uninstallServer } from './languageServers.js';

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

  // --- Custom title bar: window controls + menu popups ---
  const winOf = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(event.sender);
  ipcMain.on('win:minimize', (event) => winOf(event)?.minimize());
  ipcMain.on('win:toggleMaximize', (event) => {
    const w = winOf(event);
    if (w?.isMaximized()) w.unmaximize();
    else w?.maximize();
  });
  ipcMain.on('win:close', (event) => winOf(event)?.close());
  ipcMain.on('win:setFullScreen', (event, on: boolean) => winOf(event)?.setFullScreen(!!on));
  ipcMain.on('win:openExternal', (_event, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  ipcMain.handle('win:isMaximized', (event) => winOf(event)?.isMaximized() ?? false);
  ipcMain.on('win:popupMenu', (event, { label, x, y }: { label: string; x: number; y: number }) => {
    const w = winOf(event);
    if (w) popupMenu(w, label, x, y);
  });
  ipcMain.handle('git:status', (_event, rootPath: string) => getGitStatus(rootPath));
  ipcMain.handle('git:fileHead', (_event, filePath: string) => getFileHeadContent(filePath));
  ipcMain.handle('git:stage', (_event, root: string, filepath: string) => stageFile(root, filepath));
  ipcMain.handle('git:unstage', (_event, root: string, filepath: string) =>
    unstageFile(root, filepath),
  );
  ipcMain.handle('git:stageAll', (_event, root: string) => stageAll(root));
  ipcMain.handle('git:commit', (_event, root: string, message: string) => commit(root, message));
  ipcMain.handle('git:diffStaged', (_event, root: string) => getStagedDiff(root));
  ipcMain.handle('git:createPr', async (_event, root: string) => {
    const res = await createPullRequest(root);
    if (res.url) void shell.openExternal(res.url);
    return res;
  });

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
    // Run the server in the workspace root so it finds tsconfig.json / node_modules
    // and resolves project + builtin modules (otherwise files analyse in isolation).
    lsp.start(language, { cwd: getRoot() || undefined }, (id, message) =>
      event.sender.send('lsp:message', { id, message }),
    ),
  );
  ipcMain.on(
    'lsp:send',
    (_event, { id, message }: { id: string; message: JsonRpcMessage }) => lsp.send(id, message),
  );
  ipcMain.on('lsp:stop', (_event, { id }: { id: string }) => lsp.stop(id));
  ipcMain.handle('lsp:hasServer', (_event, command: string) => commandExists(command));
  ipcMain.handle('lsp:installServer', (_event, id: string) => installServer(id));
  ipcMain.handle('lsp:uninstallServer', (_event, id: string) => uninstallServer(id));

  // --- AI: bridge the renderer to a FreeLLMAPI server ---
  // Default is a local server, but a URL can be passed (from Settings) so a team
  // can point every Strix at one shared FreeLLMAPI host on the LAN.
  const defaultBase =
    process.env.FREELLMAPI_URL ?? `http://localhost:${process.env.FREELLMAPI_PORT ?? '3001'}`;
  const baseFrom = (url?: string) =>
    url && url.trim() ? url.trim().replace(/\/+$/, '') : defaultBase;

  const fetchKey = async (base: string): Promise<string> => {
    const res = await fetch(`${base}/api/settings/api-key`);
    const body = (await res.json()) as { apiKey: string };
    return body.apiKey;
  };

  ipcMain.handle('ai:config', async (_event, url?: string) => {
    const base = baseFrom(url);
    try {
      return { baseURL: `${base}/v1`, apiKey: await fetchKey(base) };
    } catch {
      return { baseURL: `${base}/v1`, apiKey: '' };
    }
  });

  // Collaboration is opt-in: set COLLAB_SERVER_URL to enable (off by default).
  ipcMain.handle('collab:url', () => process.env.COLLAB_SERVER_URL ?? null);

  ipcMain.handle('ai:models', async (_event, url?: string) => {
    const base = baseFrom(url);
    try {
      const apiKey = await fetchKey(base);
      const res = await fetch(`${base}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = (await res.json()) as { data?: { id: string }[] };
      const ids = (body.data ?? []).map((m) => m.id).filter((id) => id !== 'auto');
      return ['auto', ...ids];
    } catch {
      return ['auto'];
    }
  });

  // --- AI provider keys: add/list/delete FreeLLMAPI keys from the IDE ---
  ipcMain.handle('ai:listKeys', async (_event, url?: string) => {
    try {
      const res = await fetch(`${baseFrom(url)}/api/keys`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  });

  ipcMain.handle('ai:addKey', async (_event, platform: string, key: string, url?: string) => {
    try {
      const res = await fetch(`${baseFrom(url)}/api/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, key }),
      });
      if (res.ok) return { ok: true };
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, error: body.error?.message ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not reach the AI server' };
    }
  });

  ipcMain.handle('ai:deleteKey', async (_event, id: number, url?: string) => {
    try {
      const res = await fetch(`${baseFrom(url)}/api/keys/${id}`, { method: 'DELETE' });
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  });
}
