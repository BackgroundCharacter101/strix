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
}

const DEFAULT_IGNORE = ['node_modules', '.git', 'dist'];

export async function readFileContents(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function writeFileContents(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

// Read up to `maxBytes` of a file as base64 (for the hex viewer). Reads only the
// capped prefix via a file handle so huge files don't blow up memory.
export async function readFileBytes(
  filePath: string,
  maxBytes = 1_048_576,
): Promise<{ base64: string; size: number; truncated: boolean }> {
  const fh = await fs.open(filePath, 'r');
  try {
    const stat = await fh.stat();
    const len = Math.min(stat.size, maxBytes);
    const buf = Buffer.alloc(len);
    if (len > 0) await fh.read(buf, 0, len, 0);
    return { base64: buf.toString('base64'), size: stat.size, truncated: stat.size > maxBytes };
  } finally {
    await fh.close();
  }
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

export async function buildFileTree(
  rootPath: string,
  options: FileTreeOptions = {},
): Promise<FileNode> {
  const { maxDepth = Infinity, ignore = DEFAULT_IGNORE } = options;
  const ignoreSet = new Set(ignore);

  async function walk(currentPath: string, depth: number): Promise<FileNode> {
    const name = path.basename(currentPath);
    const stat = await fs.stat(currentPath);

    if (!stat.isDirectory()) {
      return { name, path: currentPath, type: 'file' };
    }

    const node: FileNode = { name, path: currentPath, type: 'directory', children: [] };

    if (depth >= maxDepth) {
      return node;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const sorted = entries
      .filter((entry) => !ignoreSet.has(entry.name))
      .sort((a, b) => {
        // Directories first, then alphabetical.
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

    node.children = await Promise.all(
      sorted.map((entry) => walk(path.join(currentPath, entry.name), depth + 1)),
    );

    return node;
  }

  return walk(rootPath, 0);
}
