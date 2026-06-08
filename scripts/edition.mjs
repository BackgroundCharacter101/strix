#!/usr/bin/env node
// Build / run / package a Strix EDITION with the edition flag baked into both
// bundles and a distinct product name + appId + output dir, so the two installers
// coexist on one machine.
//
//   node scripts/edition.mjs <edition> <action>
//
//   edition : m1 | competition           (default: m1)
//   action  : build | start | win | linux | mac | dir   (default: build)
//
// Examples:
//   node scripts/edition.mjs competition start   # run YOUR build (Claude + cybersec)
//   node scripts/edition.mjs m1 win              # build the free M1 Windows installer
//   node scripts/edition.mjs competition win     # build the M1 Competition installer
//
// The edition is passed to Vite (renderer) and esbuild (main) via the
// STRIX_EDITION env var, which both configs read to set the __STRIX_EDITION__
// compile-time define. See apps/desktop/renderer/src/edition.ts.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(root, 'apps', 'desktop');

const edition = (process.argv[2] || 'm1').toLowerCase() === 'competition' ? 'competition' : 'm1';
const action = (process.argv[3] || 'build').toLowerCase();
const isComp = edition === 'competition';

// Per-edition identity. Distinct appId + productName so both can be installed
// side by side and show up as separate apps.
const productName = isComp ? 'Strix M1 Competition' : 'Strix M1';
const appId = isComp ? 'com.strix.ide.competition' : 'com.strix.ide';
const outDir = path.join('release', edition);

const env = { ...process.env, STRIX_EDITION: edition };
const onWin = process.platform === 'win32';

function run(cmd, args, cwd) {
  const printable = [cmd, ...args].join(' ');
  console.log(`\n[edition:${edition}] ${printable}\n`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: onWin });
  if (r.status !== 0) {
    console.error(`\n[edition:${edition}] failed (${r.status}): ${printable}`);
    process.exit(r.status ?? 1);
  }
}

// 1. Always build the app first (renderer + main) with the edition baked in.
run('npm', ['--workspace', '@strix/desktop', 'run', 'build:app'], root);

// 2. Then run or package as requested.
if (action === 'build') {
  console.log(`\n[edition:${edition}] build complete — "${productName}".`);
} else if (action === 'start') {
  run('npx', ['electron', '.'], desktop);
} else {
  const targetFlag = { win: '--win', linux: '--linux', mac: '--mac', dir: '--dir' }[action];
  if (!targetFlag) {
    console.error(`Unknown action "${action}". Use: build | start | win | linux | mac | dir`);
    process.exit(2);
  }
  run(
    'npx',
    [
      'electron-builder',
      targetFlag,
      `-c.productName=${productName}`,
      `-c.appId=${appId}`,
      `-c.directories.output=${outDir}`,
    ],
    desktop,
  );
  console.log(`\n[edition:${edition}] packaged "${productName}" → apps/desktop/${outDir}`);
}
