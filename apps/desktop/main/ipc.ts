import { ipcMain } from 'electron';
import { buildFileTree, readFileContents, writeFileContents } from './fs.js';
import { getGitStatus } from './git.js';

// Maps the file:* channels (ARCHITECTURE §6.7) to the filesystem core.
export function registerIpcHandlers(): void {
  ipcMain.handle('file:read', (_event, filePath: string) => readFileContents(filePath));
  ipcMain.handle('file:write', (_event, filePath: string, content: string) =>
    writeFileContents(filePath, content),
  );
  ipcMain.handle('file:tree', (_event, rootPath: string) => buildFileTree(rootPath));
  ipcMain.handle('workspace:root', () => process.cwd());
  ipcMain.handle('git:status', (_event, rootPath: string) => getGitStatus(rootPath));
}
