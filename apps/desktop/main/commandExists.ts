import { promises as fs } from 'fs';
import * as path from 'path';

// Returns true if `command` resolves to an executable on PATH. Used to detect
// whether a language server is installed without spawning it. Electron-free so
// it can be unit-tested.
export async function commandExists(command: string): Promise<boolean> {
  if (!command) return false;
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase())
      : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      try {
        await fs.access(path.join(dir, command + ext));
        return true;
      } catch {
        // keep looking
      }
    }
  }
  return false;
}
