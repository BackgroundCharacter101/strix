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
- **asarUnpack**: `node-pty` (native module) is left unpacked so the terminal works.
- **win.target**: `nsis` (installer) + `portable`.
- The packaged exe is **IDE-only** — it does **not** bundle or auto-start a
  FreeLLMAPI server. The recommended team model is one shared AI host that every
  Strix points at (Settings → AI → AI server URL). See **`docs/TEAM_SETUP.md`**.
  (For a single-machine local build, the AI server can still run via
  `main/aiServer.ts`, which launches it with the Electron binary as Node from
  `process.resourcesPath` when packaged — but no server is bundled by default.)

## Known limitations / TODO before shipping

1. **App icon.** No `.ico` yet — electron-builder uses a default icon. Add
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
