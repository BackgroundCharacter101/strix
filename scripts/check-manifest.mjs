#!/usr/bin/env node
// Guard against the recurring apps/desktop/package.json truncation (an editor /
// formatter has twice stripped scripts + the electron-builder "build" config +
// devDependencies, which silently breaks packaging). Asserts the critical fields
// exist so a mangled manifest fails the gate/commit/CI instead of a broken build
// reaching users.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'apps', 'desktop', 'package.json');

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`✗ cannot read/parse ${file}: ${e.message}`);
  process.exit(1);
}

const problems = [];
const need = (cond, msg) => {
  if (!cond) problems.push(msg);
};

need(pkg.main === 'dist/main/index.cjs', `main must be "dist/main/index.cjs" (got "${pkg.main}")`);
need(pkg.scripts?.['build:app'], 'scripts."build:app" missing');
need(pkg.scripts?.['package:m1'], 'scripts."package:m1" missing');
need(pkg.scripts?.['package:competition'], 'scripts."package:competition" missing');
need(pkg.build, 'electron-builder "build" config missing');
need(pkg.build?.appId, 'build.appId missing');
need(pkg.build?.asar === true, 'build.asar must be true');
need(pkg.build?.nsis, 'build.nsis (installer config) missing');
need(Array.isArray(pkg.build?.asarUnpack), 'build.asarUnpack missing (node-pty must be unpacked)');
need(Array.isArray(pkg.build?.extraResources), 'build.extraResources missing (bundled FreeLLMAPI)');
need(pkg.devDependencies?.electron, 'devDependencies.electron missing');
need(pkg.devDependencies?.['electron-builder'], 'devDependencies.electron-builder missing');
need(pkg.dependencies?.['node-pty'], 'dependencies.node-pty missing');

if (problems.length) {
  console.error('✗ apps/desktop/package.json is missing required fields:');
  for (const p of problems) console.error(`    - ${p}`);
  console.error(
    '\nLikely truncated by an editor/formatter. Restore the full file from git:\n' +
      '    git checkout HEAD -- apps/desktop/package.json',
  );
  process.exit(1);
}
console.log('✓ apps/desktop/package.json manifest is complete');
