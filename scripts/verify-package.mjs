#!/usr/bin/env node
// Validate a packaged Strix build WITHOUT launching a GUI, catching the classes
// of failure we hit during packaging (ESM-in-asar no-window, the
// createRequire(import.meta.url)=undefined crash, missing node-pty/renderer/AI
// server). Run after packaging:  node scripts/verify-package.mjs [m1|competition]
//
// Exits non-zero with a clear report on any problem, so packaging fails loudly
// instead of shipping a broken installer.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editions = process.argv.slice(2).length ? process.argv.slice(2) : ['m1', 'competition'];

let failures = 0;
const check = (cond, label) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures += 1;
};

for (const ed of editions) {
  const unpacked = path.join(repoRoot, 'apps/desktop/release', ed, 'win-unpacked');
  if (!fs.existsSync(unpacked)) {
    console.log(`\n[${ed}] no win-unpacked build — skipping`);
    continue;
  }
  console.log(`\n[${ed}] verifying ${unpacked}`);
  const asarPath = path.join(unpacked, 'resources', 'app.asar');

  if (!fs.existsSync(asarPath)) {
    check(false, 'resources/app.asar exists (asar packing on)');
    continue;
  }

  let raw = [];
  try {
    raw = asar.listPackage(asarPath);
  } catch (e) {
    check(false, `app.asar is readable (${e.message})`);
    continue;
  }
  // listPackage may use '/' or (on Windows) '\' separators; match on a
  // normalized suffix but keep the RAW stored path for extractFile.
  const norm = (p) => p.replace(/\\/g, '/');
  const find = (suffix) => raw.find((p) => norm(p).endsWith(suffix));
  const entry = (p) => p.replace(/^[\\/]/, ''); // strip leading separator
  check(!!find('/dist/main/index.cjs'), 'CJS main entry in asar (dist/main/index.cjs)');
  check(!!find('/dist/main/preload.cjs'), 'CJS preload in asar (dist/main/preload.cjs)');
  check(!!find('/renderer/dist/index.html'), 'renderer in asar (renderer/dist/index.html)');

  // package.json main must point at the CJS entry. Match the ROOT package.json
  // exactly (not some nested dependency's).
  const pkgEntry = raw.find((p) => norm(p) === 'package.json' || norm(p) === '/package.json');
  try {
    const pkg = JSON.parse(asar.extractFile(asarPath, entry(pkgEntry)).toString('utf8'));
    check(pkg.main === 'dist/main/index.cjs', `package.json main = ${pkg.main}`);
  } catch (e) {
    check(false, `package.json readable in asar (${e.message})`);
  }

  // The main bundle must NOT reference raw import.meta (undefined in CJS), and
  // MUST contain the shim — this is the exact crash we fixed.
  const idxEntry = find('/dist/main/index.cjs');
  try {
    const idx = asar.extractFile(asarPath, entry(idxEntry)).toString('utf8');
    check(!/\bimport\.meta\b/.test(idx), 'no raw import.meta in main bundle');
    check(idx.includes('__strixImportMetaUrl'), 'import.meta.url shim present');
  } catch (e) {
    check(false, `main bundle readable (${e.message})`);
  }

  check(
    fs.existsSync(path.join(unpacked, 'resources/app.asar.unpacked/node_modules/node-pty')),
    'node-pty unpacked (terminal works)',
  );
  check(
    fs.existsSync(path.join(unpacked, 'resources/freellmapi/server/dist/index.js')),
    'bundled FreeLLMAPI server present',
  );
}

if (failures > 0) {
  console.error(`\n✗ package verification FAILED (${failures} problem(s))`);
  process.exit(1);
}
console.log('\n✓ package verification passed');
