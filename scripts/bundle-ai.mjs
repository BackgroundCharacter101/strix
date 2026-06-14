#!/usr/bin/env node
// Bundle the vendored FreeLLMAPI server into a single ESM file so the packaged
// app ships ~a handful of files instead of FreeLLMAPI's ~33k node_modules tree.
//
// Output: freellmapi/.bundle/
//   index.mjs                      — the whole server, bundled (esbuild)
//   node_modules/sql.js/           — kept external: sql.js loads its .wasm at
//                                    runtime via require.resolve, so it can't be
//                                    inlined. This is the only runtime dep left.
//
// extraResources ships only freellmapi/.bundle; aiServer.aiServerPaths prefers
// .bundle/index.mjs when present (packaged builds).
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const freellmapi = path.join(root, 'freellmapi');
const serverEntry = path.join(freellmapi, 'server', 'dist', 'index.js');
const bundleDir = path.join(freellmapi, '.bundle');
const onWin = process.platform === 'win32';

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: onWin });
  if (r.status !== 0) {
    console.error(`[bundle-ai] failed (${r.status}): ${[cmd, ...args].join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

// 1. Ensure the server is compiled (dist/index.js). Build if missing.
if (!existsSync(serverEntry)) {
  console.log('[bundle-ai] server dist missing — building FreeLLMAPI server…');
  run('npm', ['run', 'build'], path.join(freellmapi, 'server'));
}

// 2. Fresh bundle dir.
rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(bundleDir, { recursive: true });

// 3. esbuild: bundle everything except sql.js. ESM output keeps import.meta;
//    the banner provides a real `require` for transitive dynamic require('fs').
//    Use the Node API (not the CLI) so the banner's spaces/semicolons don't get
//    mangled by the Windows shell.
const esbuild = createRequire(path.join(root, 'apps', 'desktop', 'package.json'))('esbuild');
await esbuild.build({
  entryPoints: [serverEntry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['sql.js'],
  banner: { js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" },
  outfile: path.join(bundleDir, 'index.mjs'),
  logLevel: 'warning',
});

// 4. Copy the sql.js package (JS + .wasm) next to the bundle so require('sql.js')
//    and require.resolve('sql.js/dist/sql-wasm.wasm') resolve at runtime.
const sqlSrc = path.join(freellmapi, 'node_modules', 'sql.js');
const sqlDst = path.join(bundleDir, 'node_modules', 'sql.js');
if (!existsSync(sqlSrc)) {
  console.error(`[bundle-ai] sql.js not found at ${sqlSrc}. Run "npm run ai:setup" first.`);
  process.exit(1);
}
mkdirSync(path.dirname(sqlDst), { recursive: true });
cpSync(sqlSrc, sqlDst, { recursive: true });

console.log('[bundle-ai] FreeLLMAPI bundled → freellmapi/.bundle/index.mjs (+ sql.js)');
