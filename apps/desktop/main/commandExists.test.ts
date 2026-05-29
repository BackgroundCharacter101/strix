import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { commandExists } from './commandExists';

let tmp: string;
const originalPath = process.env.PATH;
const originalPathExt = process.env.PATHEXT;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'strix-cmd-'));
  process.env.PATH = tmp;
  // Make the check ext-agnostic across platforms in tests.
  process.env.PATHEXT = '.EXE;.CMD;.BAT';
});

afterEach(async () => {
  process.env.PATH = originalPath;
  process.env.PATHEXT = originalPathExt;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('commandExists', () => {
  it('finds a command present on PATH', async () => {
    // Cover both unix (bare) and windows (.cmd/.exe) lookups.
    await fs.writeFile(path.join(tmp, 'mytool'), '');
    await fs.writeFile(path.join(tmp, 'mytool.cmd'), '');
    await fs.writeFile(path.join(tmp, 'mytool.exe'), '');
    expect(await commandExists('mytool')).toBe(true);
  });

  it('returns false for a missing command', async () => {
    expect(await commandExists('definitely-not-installed-xyz')).toBe(false);
  });

  it('returns false for an empty command', async () => {
    expect(await commandExists('')).toBe(false);
  });
});
