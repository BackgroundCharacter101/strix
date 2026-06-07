# Packaging Strix (Phase 8)

Turns Strix into an installable app via **electron-builder** — Windows (NSIS +
portable `.exe`), **Linux (AppImage + `.deb`)**, and macOS (dmg + zip).

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

## Linux & macOS builds

Strix's runtime is already cross-platform: the terminal uses `$SHELL` (falls back
to `bash`) on non-Windows, the LSP only passes `shell:true` on Windows, the app
menu adapts for macOS, and the bundled AI server is pure-JS (sql.js/WASM). So the
only platform-specific piece is the installer target.

```bash
# On a Linux machine (builds Linux-native node-pty automatically):
cd tabea
npm install
npm run ai:setup
npm --workspace @strix/desktop run package:linux
#   → apps/desktop/release/
#     Strix-<version>.AppImage   (portable, runs anywhere)
#     strix_<version>_amd64.deb  (Debian/Ubuntu install)

# macOS:
npm --workspace @strix/desktop run package:mac   # → dmg + zip
```

> **Build each OS on that OS.** electron-builder rebuilds the one native module
> (`node-pty`) for the host platform, so produce the Linux build on Linux and the
> macOS build on macOS (or via CI runners). Cross-compiling native modules from
> Windows is not supported here.
>
> AppImage needs FUSE on the target to run (`./Strix-*.AppImage`); most distros
> have it, or run with `--appimage-extract-and-run`.

Config lives in `apps/desktop/package.json` → `build.linux` (AppImage + deb,
category `Development`) and `build.mac` (dmg + zip).

## How it's wired (`apps/desktop/package.json` → `build`)

- **files**: the built `dist/**` (main) + `renderer/dist/**` (renderer) + manifest.
- **asarUnpack**: `node-pty` (native module) is left unpacked so the terminal works.
- **extraResources**: the vendored **`freellmapi`** server is copied into
  `resources/freellmapi` (built `server/dist` + its `node_modules`). Each install
  runs its **own** local AI server — nothing connects to anyone else's machine.
- **win.target**: `nsis` (installer) + `portable`.

### Local AI server, bundled (no native modules)

The packaged exe bundles and auto-starts FreeLLMAPI **on each machine**:

- `main/aiServer.ts` launches the server with the **Electron binary as Node**
  (`ELECTRON_RUN_AS_NODE=1`, `nodeExec = process.execPath`) from
  `process.resourcesPath/freellmapi` — packaged apps have no guaranteed system
  `node`.
- FreeLLMAPI's database is **sql.js** (SQLite compiled to WebAssembly — pure JS,
  **no native module**). That's the whole reason this bundles cleanly: there's no
  `better-sqlite3` ABI to rebuild for Electron. See
  `freellmapi/server/src/db/sqljs-adapter.ts`.
- The DB file is written to a **per-user writable folder**: main passes
  `dataDir: app.getPath('userData')`, which `aiServer.ts` turns into
  `FREELLMAPI_DB_PATH` (the install dir is read-only).
- The renderer's `aiServerUrl` setting is left **blank** for the local model, so
  `window.strix.ai.config()` talks to `http://localhost:3001`.

## Known limitations / TODO before shipping

1. **App icon.** No icon yet — electron-builder uses a default. Add a 256×256
   `.ico` (`build.win.icon`), a `build/icon.png` (Linux, ≥512×512), and an
   `.icns` (`build.mac.icon`) — all derivable from the owl mark.
3. **Code signing.** Unsigned builds trigger SmartScreen warnings on Windows.
   Add a code-signing certificate (`build.win.certificateFile` / env) for
   distribution.
4. **node-pty is the only native module left.** `node-pty` (terminal) still needs
   the Electron ABI; electron-builder rebuilds it and it's asarUnpacked — confirm
   it loads in the packaged app, and run `electron-rebuild` if not. **FreeLLMAPI no
   longer has a native module** (it's sql.js/WASM now), so the bundled server needs
   **no** rebuild and is portable across Electron versions and OSes.
5. **sql.js WASM must ship.** The extraResources filter pulls in
   `freellmapi/.../node_modules/**`, which includes `sql.js/dist/sql-wasm.wasm`.
   `aiServer.ts` resolves it at runtime via `require.resolve(...)`. If the WASM is
   missing from `resources/`, the server can't open its DB — verify it's present
   in `win-unpacked/resources/freellmapi/.../node_modules/sql.js/dist/`.
6. **Bundle size.** Shipping `freellmapi` `node_modules` is large. Consider
   `npm prune --omit=dev` in freellmapi before packaging, or bundling the server
   with esbuild (keeping `sql-wasm.wasm` as an asset).
7. **First real build is the verification gate.** The sql.js swap and the bundling
   can't be exercised in the dev sandbox (sql.js isn't installed there). After
   `npm install`, run `npm -w @freellmapi/server test` to validate the adapter,
   then `package:dir` and smoke-test the AI panel in `win-unpacked/Strix.exe`.
