import { dialog, type BrowserWindow } from 'electron';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import * as fs from 'fs';
import * as path from 'path';
import { repoNameFromUrl } from './repoName.js';
import { getToken } from './github.js';

export { repoNameFromUrl };

// The active workspace root. Empty until the user opens a folder, so a fresh
// launch shows the welcome screen instead of the app's own install directory
// (the launch cwd). Set at runtime via Open Folder / Clone / New Project.
let currentRoot = '';

export function getRoot(): string {
  return currentRoot;
}

export function setRoot(dir: string): void {
  currentRoot = dir;
}

async function pickDirectory(win: BrowserWindow | null, title: string): Promise<string | null> {
  const opts = { title, properties: ['openDirectory' as const] };
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
}

export async function openFolderDialog(win: BrowserWindow | null): Promise<string | null> {
  const dir = await pickDirectory(win, 'Open Folder');
  if (dir) currentRoot = dir;
  return dir;
}

// Create a new project: pick a parent folder, make a named subfolder there,
// and open it as the workspace.
export async function newProjectDialog(
  win: BrowserWindow | null,
  name: string,
): Promise<string | null> {
  const parent = await pickDirectory(win, 'Choose where to create the project');
  if (!parent) return null;
  const safe = name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'new-project';
  const dir = path.join(parent, safe);
  await fs.promises.mkdir(dir, { recursive: true });
  currentRoot = dir;
  return dir;
}

export async function openFileDialog(win: BrowserWindow | null): Promise<string | null> {
  const opts = { title: 'Open File', properties: ['openFile' as const] };
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
}

// Save-as dialog (Ctrl+S on an untitled buffer). Defaults into the workspace so
// the user is prompted where in the project to save. Returns the chosen path.
export async function saveFileDialog(
  win: BrowserWindow | null,
  defaultName: string,
): Promise<string | null> {
  const opts = {
    title: 'Save As',
    defaultPath: currentRoot ? path.join(currentRoot, defaultName) : defaultName,
  };
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  return res.canceled || !res.filePath ? null : res.filePath;
}

export async function cloneRepo(win: BrowserWindow | null, url: string): Promise<string | null> {
  const parent = await pickDirectory(win, 'Choose a folder to clone into');
  if (!parent) return null;
  const dir = path.join(parent, repoNameFromUrl(url));
  // Use the connected GitHub token (if any) so private repos clone too.
  const token = await getToken().catch(() => '');
  const onAuth = token ? () => ({ username: 'x-access-token', password: token }) : undefined;
  await git.clone({ fs, http, dir, url, singleBranch: true, depth: 1, onAuth });
  currentRoot = dir;
  return dir;
}
