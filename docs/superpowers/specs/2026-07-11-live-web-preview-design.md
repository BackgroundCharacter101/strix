# Live Web Preview — Design

_Date: 2026-07-11 · Status: approved, implementing_

## Goal

A **"Live Preview"** tab that runs the project's dev server and shows the real
running app (React/Vue/Svelte/plain HTML) inside the IDE, with the dev server's
own HMR/live-update. Replaces today's "open the detected URL in your external
browser" with an in-IDE mini-browser embedded in a dedicated tab.

Approved decisions:
1. **Auto-start dev server + embed** (fall back to the static host for plain
   HTML/JS sites with no dev script).
2. Embed surface = **Electron `<webview>`** (isolated mini-browser; bypasses the
   renderer CSP; can't be blocked by an app's X-Frame-Options).
3. Placement = a **dedicated "Live Preview" tab** in the editor area.

## Components (isolated units)

| Unit | Path | Responsibility | Depends on |
|---|---|---|---|
| `detectServerUrl` (pure) | `renderer/src/runTargets.ts` (extend) | Scan dev-server stdout for the first localhost URL. Already partly present for Run & Serve; broaden + unit-test. | — |
| `devServer.ts` (main) | `apps/desktop/main/devServer.ts` | Manage ONE dev-server child per root: spawn command in the workspace, pipe stdout/stderr, detect URL, expose start/stop/status + emit events. Kill the process tree on stop. Idempotent per root (mirrors `staticServer.ts`). | `node:child_process`, `detectServerUrl` |
| IPC surface | `ipc.ts` + `preload.mts` + `bridge.ts` | `preview.start(command)` / `preview.stop()` / `preview.status()`; events `preview:url` / `preview:log` / `preview:exit`. | `devServer.ts` |
| `LivePreview.tsx` | `renderer/src/LivePreview.tsx` | The tab UI: a `<webview>` + slim toolbar (reload · address · open-in-browser · responsive width Desktop/Tablet/Mobile · DevTools · Stop) + collapsible log strip + start/error states. | `window.strix.preview.*` |
| Tab integration | `useEditorTabs.ts` + `App.tsx` + `RunView.tsx` | A `live-preview` tab type opened from Run & Serve, the command palette ("Preview: Open Live Preview"), or a toolbar button. | — |

Each unit is testable alone: `detectServerUrl` and the tab-model changes are
pure; `LivePreview` against a mocked bridge; `devServer` core (URL scan) pure with
a thin, smoke-tested spawn wrapper.

## Data flow

```
open Live Preview tab
  → renderer detects the dev target (runTargets over package.json)
  → preview.start(command)             [no dev script → static-host fallback]
  → main spawns the dev server in the workspace root, scans stdout for the URL
  → emit preview:url(url) → <webview>.src = url    (live app; HMR updates it)
  → preview:log(lines) → status/log strip
close tab / click Stop → preview.stop() → kill the process tree
```

- **Framework apps**: the dev server's HMR updates the webview live — no manual
  reload on edit.
- **Plain HTML/JS** (no dev script): fall back to the existing 127.0.0.1 static
  host (`serve:start`) and **reload the webview on file save** (the fs watcher
  already emits `fs:changed`).

## Dev server lifecycle (`devServer.ts`)

- Single managed child per root (like `staticServer`). `start(root, command)`:
  spawn `command` with `shell: true`, `cwd: root`, piped stdio.
- Accumulate a rolling stdout/stderr tail; on each chunk run `detectServerUrl`.
  First match → emit `preview:url` once (then stop scanning). Emit `preview:log`
  for the status strip.
- `stop()`: kill the process tree (Windows: `taskkill /pid <pid> /T /F`;
  POSIX: `kill(-pid)`). Also stop on window close / `will-quit`.
- `status()` → `{ running, url, command, root }`.
- If the renderer passes no command (plain-HTML project), it instead calls the
  existing `serve.start` and treats that URL as the preview URL — devServer is
  not involved for the static path.

## Electron changes

- `webviewTag: true` in `webPreferences` (main/index.ts).
- On the `<webview>`: route `new-window` / external-origin navigation to
  `shell.openExternal`; keep localhost in-view.
- **Security:** enabling `webviewTag` widens the attack surface. Mitigation: we
  only ever load localhost/dev URLs; external links open in the OS browser; the
  webview does not get Node integration. CSP of the main renderer is unchanged.

## Error handling

- URL not detected within ~30 s → show the captured logs + a manual "enter URL"
  input so the user can point the webview themselves.
- Dev server exits/crashes → show exit code + logs + a **Restart** button.
- `<webview>` `did-fail-load` (server not up yet) → inline **Retry** (auto-retry a
  few times with backoff while the server is still booting).
- Port already in use → surfaced verbatim via the log strip.

## Testing

- `detectServerUrl` — table of real banners → expected URL:
  Vite (`Local:   http://localhost:5173/`), Next (`http://localhost:3000`), CRA
  (`On Your Network`), Astro, Angular (`http://localhost:4200`), `0.0.0.0:PORT`,
  https; and noise → `null`.
- `devServer.ts` — pure scan covered above; spawn wrapper smoke-tested against a
  trivial real node http server that prints a Vite-style URL line, asserting
  `preview:url` fires and `stop()` ends the process.
- `LivePreview.test.tsx` — mock `window.strix.preview`: starts on open, sets the
  `<webview>` `src` on `preview:url`, reload/stop/open-external call the bridge,
  the log strip renders, and the error state shows on `preview:exit`.
- No live framework build in CI (would need a real dev server) — that stays a
  manual smoke test.

## Scope guard (YAGNI)

One live preview at a time. Toolbar = reload + open-external + responsive presets
+ DevTools + Stop (no full back/forward history). No network throttling, no
multiple simultaneous previews. These can come later without reworking the
architecture (devServer already keys per root; the tab model can hold more than
one `live-preview` tab if we lift the single-instance limit).
