import { ipcMain } from 'electron';
import { buildFileTree, readFileContents, writeFileContents } from './fs.js';
import { getGitStatus } from './git.js';
import { TerminalManager, type TerminalCreateOptions } from './terminal.js';
import { LspManager, type Language, type JsonRpcMessage } from './lsp.js';

// Maps the file:*, workspace:*, git:*, and terminal:* channels
// (ARCHITECTURE §6.7) to the corresponding main-process services.
export function registerIpcHandlers(): void {
  ipcMain.handle('file:read', (_event, filePath: string) => readFileContents(filePath));
  ipcMain.handle('file:write', (_event, filePath: string, content: string) =>
    writeFileContents(filePath, content),
  );
  ipcMain.handle('file:tree', (_event, rootPath: string) => buildFileTree(rootPath));
  ipcMain.handle('workspace:root', () => process.cwd());
  ipcMain.handle('git:status', (_event, rootPath: string) => getGitStatus(rootPath));

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

  const lsp = new LspManager();
  ipcMain.handle('lsp:start', (event, language: Language) =>
    lsp.start(language, {}, (id, message) => event.sender.send('lsp:message', { id, message })),
  );
  ipcMain.on(
    'lsp:send',
    (_event, { id, message }: { id: string; message: JsonRpcMessage }) => lsp.send(id, message),
  );
  ipcMain.on('lsp:stop', (_event, { id }: { id: string }) => lsp.stop(id));
}
