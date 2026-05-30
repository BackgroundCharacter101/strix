import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanWorkspace } from './securityScan';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'strix-sec-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function write(rel: string, content: string) {
  const full = path.join(tmp, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

describe('scanWorkspace', () => {
  it('flags an AWS key as high severity with the right line', async () => {
    await write('src/a.ts', 'const ok = 1;\nconst key = "AKIA1234567890ABCD12";\n');
    const findings = await scanWorkspace(tmp);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 2, severity: 'high', rule: 'AWS access key id' });
    expect(findings[0].path).toBe('src/a.ts');
  });

  it('ignores obvious placeholders for the generic credential rule', async () => {
    await write('b.ts', 'const apiKey = "your-api-key-goes-here-xxxx";');
    expect(await scanWorkspace(tmp)).toHaveLength(0);
  });

  it('skips node_modules', async () => {
    await write('node_modules/pkg/x.js', 'password = "supersecretvalue1234567890"');
    expect(await scanWorkspace(tmp)).toHaveLength(0);
  });

  it('returns nothing for a clean tree', async () => {
    await write('clean.ts', 'export const add = (a, b) => a + b;');
    expect(await scanWorkspace(tmp)).toEqual([]);
  });
});
