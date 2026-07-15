// Bundle the Electron main process + preload into self-contained CommonJS files.
//
// Why bundle: the main process imports `isomorphic-git`, whose transitive tree
// gets hoisted/deduped to the workspace root; electron-builder's tracer fails to
// copy those leaves into the asar, crashing at startup. Bundling inlines all of
// that JS into one file, so the packaged app needs zero node_modules resolution.
//
// Why CommonJS (not ESM): Electron's ESM loader does NOT load an ESM entry from
// inside an asar archive (the app launched but the main script never ran — no
// window). CJS require IS asar-aware, so a CJS bundle lets us keep asar ON (one
// archive → fast install, small size) and still launch reliably.
//
// Only `electron` and `node-pty` stay external: electron is provided by the
// runtime; node-pty is a native module resolved at runtime from the app's
// (asar-unpacked) node_modules. node builtins are auto-external on platform=node.
import esbuild from 'esbuild';
import { execSync } from 'node:child_process';

// Product edition baked in at build time (STRIX_EDITION=competition → the
// private build with the Claude Code menu item; anything else → the free M1).
const edition = process.env.STRIX_EDITION === 'competition' ? 'competition' : 'm1';

// Build identity (git short hash) baked in so the updater can tell one build
// from another at the SAME version. Falls back to a timestamp outside git.
let buildId = 'dev';
try {
  buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  buildId = String(Date.now());
}

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'node-pty'],
  define: {
    __STRIX_EDITION__: JSON.stringify(edition),
    __STRIX_BUILD_ID__: JSON.stringify(buildId),
    // Update feed URL baked at build time; runtime STRIX_UPDATE_URL still wins.
    // Phase 1 default = the local update server; Phase 2 = set this at build.
    __STRIX_UPDATE_URL__: JSON.stringify(
      process.env.STRIX_UPDATE_URL ?? 'http://localhost:8787',
    ),
    // CJS output has no `import.meta.url`; code uses it (createRequire,
    // fileURLToPath). Map every occurrence to a banner const derived from the
    // CJS __filename, or createRequire(undefined) throws ERR_INVALID_ARG_VALUE.
    'import.meta.url': '__strixImportMetaUrl',
  },
  banner: {
    js: 'const __strixImportMetaUrl = require("url").pathToFileURL(__filename).href;',
  },
  logLevel: 'info',
};

await esbuild.build({
  ...common,
  entryPoints: ['main/index.ts'],
  outfile: 'dist/main/index.cjs',
});

await esbuild.build({
  ...common,
  entryPoints: ['main/preload.mts'],
  outfile: 'dist/main/preload.cjs',
});
