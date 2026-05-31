# Packaging Strix (Phase 8)

Turns Strix into an installable Windows app via **electron-builder** (NSIS
installer + a portable `.exe`).

> **Status: first pass — needs a real build + test run on a Windows machine.**
> The build config and the packaged-app AI-server launch are in place and
> unit-tested, but the installer itself hasn't been produced/verified yet (it
> can't be built in the dev sandbox). See _Known limitations_ below.

## Build it

```powershell
cd "C:\Users\kavee\Documents\GitHub\tabea"

# 1. Make sure deps are installed (electron-builder is now a devDependency)
npm install

# 2. Build the vendored AI server once (so it's bundled)
npm run ai:setup

# 3. Produce the installer + portable exe
npm --workspace @strix/desktop run package
#   → output in apps/desktop/release/
#   Strix Setup <version>.exe   (NSIS installer)
#   Strix <version>.exe         (portable)

# Quick unpacked build (no installer) for testing:
npm --workspace @strix/desktop run package:dir
#   → apps/desktop/release/win-unpacked/Strix.exe
```

## How it's wired (`apps/desktop/package.json` → `build`)

- **files**: the built `dist/**` (main) + `renderer/dist/**` (renderer) + manifest.
- **extraResources**: the vendored `freellmapi/` is copied into the app's
  `resources/` so the AI server ships with the app.
- **asarUnpack**: `node-pty` (native module) is left unpacked so the terminal works.
- **win.target**: `nsis` (installer) + `portable`.
- The AI server is launched (in `main/aiServer.ts`) with the **Electron binary
  run as Node** (`ELECTRON_RUN_AS_NODE=1`, `process.execPath`) and resolved from
  `process.resourcesPath/freellmapi` — packaged apps have no guaranteed system
  `node`. In dev it still uses plain `node` and the repo path.

## Known limitations / TODO before shipping

1. **FreeLLMAPI writable data.** The bundled server keeps its key/settings in a
   SQLite DB inside its own folder. Under `resources/` that location may be
   **read-only**, so the server may fail to persist the provider key. Fix:
   point the server's data dir at a writable per-user path (e.g. Electron
   `app.getPath('userData')`) — a small change in the vendored server. Until
   then, run with `STRIX_NO_AI_SERVER=1` and a separately-started server, or
   verify whether the install dir is writable on the target machine.
2. **App icon.** No `.ico` yet — electron-builder uses a default icon. Add
   `build.win.icon` pointing at a 256×256 `.ico` (derive from the owl mark).
3. **Code signing.** Unsigned builds trigger SmartScreen warnings on Windows.
   Add a code-signing certificate (`build.win.certificateFile` / env) for
   distribution.
4. **node-pty / native rebuilds.** electron-builder normally rebuilds native
   modules for the Electron ABI; confirm `node-pty` loads in the packaged app
   (it's asarUnpacked). If it fails, run `electron-rebuild` before packaging.
5. **Bundle size.** Shipping `freellmapi/node_modules` is large. Consider
   pruning to production deps (`npm prune --omit=dev` in freellmapi) before
   packaging, or bundling the server with esbuild.
