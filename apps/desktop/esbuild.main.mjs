// Bundle the Electron main process + preload into self-contained ESM files.
//
// Why: the main process imports `isomorphic-git`, whose transitive tree
// (sha.js → to-buffer → call-bind-apply-helpers, …) gets hoisted/deduped to the
// workspace root. electron-builder's dependency tracer repeatedly fails to copy
// those deduped leaves into the packaged asar, so the app crashes at startup
// with "Cannot find module 'call-bind-apply-helpers'". Bundling inlines all of
// that JS into one file, so the packaged app needs zero node_modules resolution
// for it — the entire class of "missing module" failures disappears.
//
// Only `electron` and `node-pty` stay external: electron is provided by the
// runtime, and node-pty is a native module resolved at runtime from the app's
// (asar-unpacked) node_modules. node builtins are auto-external on platform=node.
import esbuild from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: ['electron', 'node-pty'],
  logLevel: 'info',
};

await esbuild.build({
  ...common,
  entryPoints: ['main/index.ts'],
  outfile: 'dist/main/index.js',
  // ESM output, but the inlined CJS deps (isomorphic-git, etc.) call require()
  // for node builtins. ESM has no `require`, so define one via createRequire —
  // otherwise esbuild's shim throws "Dynamic require ... is not supported".
  banner: {
    js: "import { createRequire as __strixCreateRequire } from 'node:module'; const require = __strixCreateRequire(import.meta.url);",
  },
});

await esbuild.build({
  ...common,
  entryPoints: ['main/preload.mts'],
  outfile: 'dist/main/preload.mjs',
});
