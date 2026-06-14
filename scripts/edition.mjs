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
import { existsSync, readFileSync } from 'node:fs';
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
  // On Windows we need shell:true so npm/npx resolve their .cmd shims — but the
  // shell then re-parses the command line, so any arg containing a space (e.g.
  // `-c.productName=Strix M1`) must be quoted or it splits into stray positional
  // arguments ("Unknown argument: M1").
  const finalArgs = onWin
    ? args.map((a) => (/\s/.test(a) && !a.startsWith('"') ? `"${a}"` : a))
    : args;
  const printable = [cmd, ...finalArgs].join(' ');
  console.log(`\n[edition:${edition}] ${printable}\n`);
  const r = spawnSync(cmd, finalArgs, { cwd, env, stdio: 'inherit', shell: onWin });
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
  const targetFlag = { win: '--dir', linux: '--linux', mac: '--mac', dir: '--dir' }[action];
  if (!targetFlag) {
    console.error(`Unknown action "${action}". Use: build | start | win | linux | mac | dir`);
    process.exit(2);
  }
  // Bundle FreeLLMAPI to a single ESM file so the installer ships ~a handful of
  // files instead of its ~33k node_modules tree. extraResources ships .bundle.
  run('node', ['scripts/bundle-ai.mjs'], root);
  // electron-builder builds the app payload. For Windows we use --dir (the
  // win-unpacked folder) and wrap it with our Inno Setup installer below; linux/
  // mac still produce their native installers directly.
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
  // Verify the Windows payload didn't regress (asar/CJS entry/import.meta/node-pty).
  if (action === 'win' || action === 'dir') {
    run('node', ['scripts/verify-package.mjs', edition], root);
  }
  // Build the Windows installer from the win-unpacked payload via Inno Setup.
  if (action === 'win') {
    buildInnoInstaller();
  }
}

// Compile the Inno Setup installer for this edition from win-unpacked.
function buildInnoInstaller() {
  const iscc = findISCC();
  if (!iscc) {
    console.error(
      '[edition] ISCC.exe (Inno Setup) not found. Install it:\n' +
        '  winget install JRSoftware.InnoSetup',
    );
    process.exit(1);
  }
  const version = JSON.parse(
    readFileSync(path.join(desktop, 'package.json'), 'utf8'),
  ).version;
  const edDir = path.join(desktop, 'release', edition);
  const defs = {
    MyAppName: productName,
    MyExe: `${productName}.exe`,
    MyVersion: version,
    MyEdition: edition,
    MySrcDir: path.join(edDir, 'win-unpacked'),
    MyIcon: path.join(edDir, '.icon-ico', 'icon.ico'),
    MyOutDir: edDir,
    MyOutBase: `${productName} Setup ${version}`,
    MyLicense: path.join(desktop, 'build', 'license.txt'),
    MySidebar: path.join(desktop, 'build', 'installerSidebar.bmp'),
    MyHeader: path.join(desktop, 'build', 'installerHeader.bmp'),
  };
  const args = Object.entries(defs).map(([k, v]) => `/D${k}=${v}`);
  args.push(path.join(desktop, 'build', 'installer.iss'));
  // ISCC handles its own quoting of /D values; pass args unmodified.
  console.log(`\n[edition:${edition}] ISCC ${defs.MyOutBase}.exe\n`);
  const r = spawnSync(iscc, args, { cwd: desktop, env, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n[edition:${edition}] Inno Setup failed (${r.status}).`);
    process.exit(r.status ?? 1);
  }
  console.log(`\n[edition:${edition}] installer → apps/desktop/release/${edition}/${defs.MyOutBase}.exe`);
}

function findISCC() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ];
  return candidates.find((p) => p && existsSync(p));
}
