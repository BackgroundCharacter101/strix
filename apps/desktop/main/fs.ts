import { promises as fs } from 'fs';
import * as path from 'path';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface FileTreeOptions {
  maxDepth?: number;
  ignore?: string[];
  // Stop after this many nodes so a huge repo can't blow up RAM/CPU. The flag
  // `truncated` on the root tells the UI the listing is partial.
  maxNodes?: number;
}

// Generated / dependency / VCS dirs we never want to walk — they dominate a big
// repo's file count. Covers JS, Rust, Python, Java/Gradle, Go vendor, etc.
const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
  '.turbo',
  '.cache',
  '.parcel-cache',
  'target',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.gradle',
  '.mvn',
  '.idea',
];

// Safety caps so opening a giant project can't build a truly unbounded tree
// (the crash was Infinity depth walking node_modules/.venv — millions of nodes).
// Set generously so any realistic project shows in FULL; the cap only trips on
// pathological trees, after which the Explorer shows a "list capped" banner.
// Collapsed folders don't render, so the RAM cost is ~the node objects only.
const DEFAULT_MAX_DEPTH = 40;
const DEFAULT_MAX_NODES = 250_000;

// Extra folder names the user excludes (Settings → Editor → Exclude folders).
// Applied to every tree walk so all features (explorer, AI gather, map) benefit.
let userIgnore: string[] = [];
export function setUserIgnore(list: string[]): void {
  userIgnore = list.map((s) => s.trim()).filter(Boolean);
}
function effectiveIgnore(ignore?: string[]): string[] {
  return [...(ignore ?? DEFAULT_IGNORE), ...userIgnore];
}

export async function readFileContents(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function writeFileContents(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

export async function createEntry(targetPath: string, type: 'file' | 'directory'): Promise<void> {
  if (type === 'directory') {
    await fs.mkdir(targetPath, { recursive: true });
  } else {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    // 'wx' fails if the file already exists, so we never clobber existing work.
    await fs.writeFile(targetPath, '', { flag: 'wx' });
  }
}

export async function renameEntry(from: string, to: string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
}

export async function removeEntry(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

// Sort dirents: directories first, then alphabetical (locale-aware).
function sortEntries<T extends { name: string; isDirectory(): boolean }>(entries: T[]): T[] {
  return entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// List ONE directory level (no recursion) — for lazy tree loading. Cheap on any
// size of project because it never descends.
export async function readDir(dirPath: string, ignore?: string[]): Promise<FileNode[]> {
  const ignoreSet = new Set(effectiveIgnore(ignore));
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return sortEntries(entries.filter((e) => !ignoreSet.has(e.name))).map((e) => ({
    name: e.name,
    path: path.join(dirPath, e.name),
    type: e.isDirectory() ? 'directory' : 'file',
    // Directories are marked but their children are loaded lazily on expand.
    ...(e.isDirectory() ? { children: undefined } : {}),
  }));
}

export interface FileTreeResult extends FileNode {
  // True when the walk hit maxNodes/maxDepth and the tree is partial.
  truncated?: boolean;
}

export async function buildFileTree(
  rootPath: string,
  options: FileTreeOptions = {},
): Promise<FileTreeResult> {
  const { maxDepth = DEFAULT_MAX_DEPTH, ignore, maxNodes = DEFAULT_MAX_NODES } = options;
  const ignoreSet = new Set(effectiveIgnore(ignore));
  let count = 0;
  let truncated = false;

  // Uses dirent types from readdir (no per-file stat → far fewer syscalls) and
  // stops once the node budget is spent.
  async function walk(currentPath: string, name: string, isDir: boolean, depth: number): Promise<FileNode> {
    if (!isDir) return { name, path: currentPath, type: 'file' };

    const node: FileNode = { name, path: currentPath, type: 'directory', children: [] };
    if (depth >= maxDepth || count >= maxNodes) {
      truncated = true;
      return node;
    }

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return node; // unreadable dir — skip, don't crash the whole walk
    }
    const sorted = sortEntries(entries.filter((e) => !ignoreSet.has(e.name)));

    // Take up to the remaining node budget, then walk siblings in parallel (fast
    // on a large tree) — the budget is a safety net, minor overshoot is fine.
    const take: typeof sorted = [];
    for (const e of sorted) {
      if (count >= maxNodes) {
        truncated = true;
        break;
      }
      count += 1;
      take.push(e);
    }
    node.children = await Promise.all(
      take.map((e) => walk(path.join(currentPath, e.name), e.name, e.isDirectory(), depth + 1)),
    );
    return node;
  }

  const root = await walk(rootPath, path.basename(rootPath), true, 0);
  return { ...root, truncated };
}
