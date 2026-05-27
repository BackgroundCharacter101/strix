import { dialog, type BrowserWindow } from 'electron';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import * as fs from 'fs';
import * as path from 'path';
import { repoNameFromUrl } from './repoName.js';

export { repoNameFromUrl };

// The active workspace root. Starts at the launch cwd but can be changed at
// runtime via Open Folder / Clone.
let currentRoot = process.cwd();

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

export async function openFileDialog(win: BrowserWindow | null): Promise<string | null> {
  const opts = { title: 'Open File', properties: ['openFile' as const] };
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
}

export async function cloneRepo(win: BrowserWindow | null, url: string): Promise<string | null> {
  const parent = await pickDirectory(win, 'Choose a folder to clone into');
  if (!parent) return null;
  const dir = path.join(parent, repoNameFromUrl(url));
  await git.clone({ fs, http, dir, url, singleBranch: true, depth: 1 });
  currentRoot = dir;
  return dir;
}
