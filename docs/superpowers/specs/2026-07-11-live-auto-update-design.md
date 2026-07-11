# Strix Live Auto-Update — Design

_Date: 2026-07-11 · Status: approved, implementing_

## Goal

On launch, Strix checks an update server. If a newer version exists, a
non-blocking banner offers it. The user clicks **Update now** → the new installer
downloads + is sha256-verified → the banner switches to **"Update ready — Restart
to apply"** → on restart the installer runs silently (no UAC, per-user install)
and relaunches Strix. No manual reinstall.

Phase 1: the update server runs on the developer's PC (localhost).
Phase 2: the identical client code points at a real host — a one-constant change.

There is intentionally **no zero-build hot-swap**: native modules (node-pty), the
Electron runtime, and the app shell live in the packaged bundle, so each release
still runs one `package` build and publishes the resulting installer. What goes
away is the manual reinstall on every machine.

## Components (5 isolated units)

| Unit | Path | Responsibility | Depends on |
|---|---|---|---|
| `updater.ts` | `apps/desktop/main/updater.ts` | check manifest, compare semver, download, verify sha256, stage installer, spawn it, relaunch | node https/fs/crypto, `app` |
| IPC surface | `apps/desktop/main/ipc.ts` + `preload.mts` + `bridge.ts` | `update:check` / `update:download` / `update:apply` invokes; `update:available` / `:progress` / `:ready` / `:error` events | `updater.ts` |
| `UpdateBanner.tsx` | `apps/desktop/renderer/src/UpdateBanner.tsx` | banner UI + state machine (idle→available→downloading%→ready→error); buttons fire IPC | `window.strix.update.*` |
| `update-server.mjs` | `scripts/update-server.mjs` | static server for `latest-<edition>.json` + installer `.exe` from `dist-updates/` | node http |
| `update-publish.mjs` | `scripts/update-publish.mjs` | after a build: copy installer → `dist-updates/`, compute sha256, write manifest | node fs/crypto |

Each unit is testable alone: the updater against a fake manifest/file, the banner
against mocked IPC, the publish script against a fixture installer.

## Data flow

```
launch → updater.check()
  GET {feedURL}/latest-<edition>.json  →  { version, url, sha256, notes, mandatory }
  semver(version) > app.getVersion()?  →  emit update:available(meta) → banner shows
click "Update now"
  download url → app.getPath('temp')/strix-update-<version>.exe
  stream update:progress({ percent })
  sha256(file) === meta.sha256 ?  →  emit update:ready  |  else emit update:error
click "Restart"
  spawn(installer, ['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'], { detached })
  app.quit()  →  installer swaps files (per-user, no UAC) → relaunches Strix
```

## Feed URL & editions

- Base URL: `STRIX_UPDATE_URL` baked at build (esbuild/vite `define`), default
  `http://localhost:8787`. Phase 2 = change the default / set the env.
- **Per-edition manifest**: `latest-m1.json`, `latest-competition.json`. The M1
  build only ever requests `latest-m1.json`; Competition stays private.
- App version = `package.json` `version` (currently `0.1.0`). Bump per release;
  `update-publish.mjs` warns if the version is unchanged from the last manifest.

## Manifest schema

```json
{
  "version": "0.2.0",
  "url": "http://localhost:8787/Strix-Setup-0.2.0.exe",
  "sha256": "<hex>",
  "notes": "What changed",
  "mandatory": false,
  "pubDate": "2026-07-11T00:00:00Z"
}
```

`mandatory` is stored but **ignored in Phase 1** (no forced-update enforcement yet).

## Installer change (per-user, silent)

`apps/desktop/build/installer.iss`:
- `PrivilegesRequired=lowest` (was `admin`)
- `DefaultDirName={localappdata}\Programs\{#MyAppName}` (was `{autopf}`)
- keep `UsePreviousAppDir=yes` so upgrades land in place
- add-to-PATH / "Open with Strix" registry writes move to `HKCU` (per-user hive)

Cost: existing admin installs need **one** manual reinstall to migrate to the
per-user location; every update after that is silent.

## Security

- **sha256 verified before execution** — corruption/tamper guard. Mismatch →
  error state, installer never runs, temp file deleted.
- No remote code execution surface added: we fetch an installer artifact, not JS.
  CSP-without-`unsafe-eval`, sandboxed IPC, no-secrets posture unchanged.
- Phase 1 localhost = http (acceptable on-box). **Phase 2 requires https** — the
  publish/deploy doc states this. Optional future: detached signature over the
  manifest.
- Installer remains unsigned → SmartScreen "unknown publisher" note unchanged
  until a code-signing cert is bought (pre-existing, out of scope).

## Testing

- `updater.test.ts`: semver compare (newer/older/equal/malformed → no update),
  sha256 match→ready / mismatch→error, network failure→error, manifest JSON parse
  failure→error. Download/apply mocked (no real installer spawn).
- `UpdateBanner.test.tsx`: renders each state; "Update now" calls
  `update.download`; "Restart" calls `update.apply`; progress percent renders.
- `update-publish.test.mjs`: given a fixture `.exe`, writes a manifest with the
  correct version + sha256 + url.
- Live install (real installer spawn + relaunch) stays a **manual smoke test** —
  not in CI.

## Out of scope (YAGNI)

Background auto-download, staged/percentage rollout, delta/blockmap patches,
rollback UI, mandatory-update enforcement. The manifest carries `mandatory` so a
later phase can add enforcement without a schema change.

## Rollout phases

1. **Local** — `npm run update:serve` on the dev PC; client default URL
   `http://localhost:8787`. Prove the full check→download→apply→relaunch loop.
2. **Hosted** — deploy `dist-updates/` behind https on a real host; bake that URL.
   Team installs (once, per-user) then self-update on every launch.
