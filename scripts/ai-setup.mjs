#!/usr/bin/env node
// Prepare the vendored FreeLLMAPI server so Strix can auto-start it:
// ensure a .env with an encryption key, then install + build.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';

const dir = path.resolve('freellmapi');
const run = (cmd) => execSync(cmd, { cwd: dir, stdio: 'inherit' });

const envPath = path.join(dir, '.env');
if (!existsSync(envPath)) {
  copyFileSync(path.join(dir, '.env.example'), envPath);
  const key = randomBytes(32).toString('hex');
  writeFileSync(envPath, readFileSync(envPath, 'utf8').replace('your-64-char-hex-key-here', key));
  console.log('[ai:setup] created freellmapi/.env with a generated ENCRYPTION_KEY');
} else {
  console.log('[ai:setup] freellmapi/.env already present');
}

console.log('[ai:setup] installing FreeLLMAPI dependencies…');
run('npm install');
console.log('[ai:setup] building server + dashboard…');
run('npm run build');
console.log('[ai:setup] ready. It auto-starts with the app, or run: npm run ai:start');
