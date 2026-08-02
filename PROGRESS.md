# Strix IDE — Progress & Handoff

> **Read this first when resuming in a new session.** It captures the current
> state, full file structure, how to run, key decisions/gotchas, and what's left.
> **Keep it updated as work continues** (standing task — update with every change).
> Last updated: 2026-08-02 · v0.2.16

---

## 1. What this is

**Strix** — a custom, Zed-inspired desktop IDE (Electron + React + TypeScript +
Monaco) with a self-hosted AI backbone (**FreeLLMAPI**). The project was
formerly named **tabea**; the on-disk folder is still
`C:\Users\kavee\Documents\GitHub\tabea` but the project/package scope is
`strix` / `@strix/*`.

- **Stack:** Electron 32, React 19, TypeScript 5 (strict), Vite 6, Monaco,
  xterm.js, node-pty, isomorphic-git, OpenAI SDK → FreeLLMAPI. Vitest, ESLint
  (flat) + typescript-eslint, npm workspaces, Turborepo.
- **GitHub:** `https://github.com/BackgroundCharacter101/strix` (private).
  Active branch **`feat/editions-m1`** (pushed; HEAD `5dd857f`). `origin/main`
  has diverged (other commits) — open a PR rather than force-pushing main.
- **Design source of truth:** `ARCHITECTURE.md`. Agent roles: `AGENTS.md` +
  `.github/agents/strix-*.agent.md`.

**Original scope was "the 4 core components" (file tree, editor, terminal, AI
panel).** The user has since explicitly asked to grow it toward a "simple but VS
Code-standard / top-tier" IDE with its own visual character. Still avoid
gratuitous complexity, but feature growth is now wanted.

---

## 1b. Editions — M1 vs M1 Competition (build-time split)

Strix ships in **two editions from one codebase**, selected by a build-time flag
(`STRIX_EDITION`, baked into both bundles as the `__STRIX_EDITION__` define):

| | **M1** (free public release) | **M1 Competition** (private) |
|---|---|---|
| FreeLLMAPI AI | ✅ | ✅ |
| FreeBuff (free coding agent) | ✅ | ✅ |
| Claude Code hand-off | ❌ | ✅ |
| Cybersec mode | ❌ | ✅ |
| productName / appId | `Strix M1` / `com.strix.ide` | `Strix M1 Competition` / `com.strix.ide.competition` |

Everything else is identical. The flag is a **compile-time constant**, so the
public M1 build has no runtime path to enable the private features (and the
Competition-only strings like the Security-AI section are tree-shaken out of the
minified M1 bundle — verified).

**Flag plumbing:**
- `apps/desktop/renderer/src/edition.ts` — renderer flags: `EDITION`,
  `IS_COMPETITION`, `CLAUDE_ENABLED`, `CYBERSEC_ENABLED`, `EDITION_LABEL`.
- `apps/desktop/main/edition.ts` — main-process copy (for the menu item).
- Defines: `renderer/vite.config.ts` + `esbuild.main.mjs` read `process.env.
  STRIX_EDITION` → `__STRIX_EDITION__`. `vitest.config.ts` pins it to
  `'competition'` so tests exercise the full feature set. **Safe default = `m1`**
  if the define is ever missing (never leak the private build).

**What the flag gates** (search `CLAUDE_ENABLED` / `CYBERSEC_ENABLED`):
- Claude: "Ask Claude Code" (AiPanel `onAskClaude`), the Claude Code terminal
  button (`TerminalTabs`), the `terminal.claude` command (App, filtered out), the
  "Start Claude Code" menu item (`main/menu.ts`).
- Cybersec: the green editor theme (`cybersec` is `CYBERSEC_ENABLED && …`), the
  status-bar mode toggle + `view.mode` command, the AI panel `mode` prop (forced
  `'normal'` in M1), and the "Security AI" Settings section.
- About dialog shows the edition (`EDITION_LABEL`).

**FreeBuff connection (self-hosted / full access):** Settings → AI → "FreeBuff
connection" lets users point the local `freebuff` CLI at their own VPS/backend
for unthrottled access — Proxy/VPS URL (HTTP(S)_PROXY), self-hosted backend URL,
and a freeform KEY=VALUE box (NO API-key field — FreeBuff has no API keys; the
freeform box covers any var it may document). A collapsible plain-language guide
sits in the panel for non-technical users. `buildFreebuffEnv()` (renderer
`freebuffEnv.ts`, tested) maps these to env vars (freeform overrides),
injected into the FreeBuff PTY session: `terminal.ts`
TerminalCreateOptions/`SpawnFn` gained `env` (merged over process.env), plumbed
App → TerminalTabs → Terminal. FreeBuff stays local (edits local files); only its
backend traffic is redirected. Change settings → reopen FreeBuff to apply.

**FreeBuff hand-off optimizations (it's most users' main AI):** "Ask FreeBuff"
now **auto-submits** (types the prompt + Enter) and **reuses the running FreeBuff
session** instead of spawning a new tab each time — `TerminalTabs.launchFreebuff`
finds the existing FreeBuff tab and bumps a `seed:{nonce,text}` to re-prompt it;
`Terminal` types it immediately on a warm session or after the readiness banner
on a cold start (30s fallback). The AI composer also clears after sending and has
native **spell-check** (red underline + right-click suggestions / add-to-dictionary
via a main-process `context-menu` handler; `webPreferences.spellcheck`, en-US).

**FreeBuff (free coding agent, BOTH editions):** `freebuff` is a free coding-agent
CLI (a build of Codebuff, `github.com/CodebuffAI/codebuff`; `npm i -g freebuff`).
It's M1's answer to Claude Code and ships in both editions (not gated). Wired the
same way as Claude Code — a "✨ FreeBuff" terminal launcher button, an "Ask
FreeBuff" button in the AI panel (hands the question + active file off), a
`terminal.freebuff` command + "Start FreeBuff" menu item, and `terminal.hasCommand`
auto-detect. It's **interactive** (no one-shot prompt arg), so the hand-off seeds
the prompt into the live session (Terminal `seedInput`, typed ~2.6s after boot,
no trailing newline — user reviews + Enter). Missing CLI → one-click `npm i -g
freebuff` in a terminal tab. No new bridge methods.

**Build / run / package** (cross-platform wrapper `scripts/edition.mjs`, no new deps):
```
npm run start:competition     # run YOUR build locally (Claude + cybersec)
npm run start:m1              # run the free build locally
npm run package:m1           # → apps/desktop/release/m1/  (Strix M1 installer)
npm run package:competition  # → apps/desktop/release/competition/
```
`package:*` runs `electron-builder --win` with `-c.productName/-c.appId/
-c.directories.output` overrides so the two installers coexist. (Packaging itself
runs on the user's machine — node-pty/electron download aren't available in the
assistant sandbox; the `build:*` step IS verified here for both editions.)

---

## 1c. Recent features (HTML preview · local host · AI roll-back)

- **Local static host server** (`main/staticServer.ts`, dependency-free, 127.0.0.1
  only, ephemeral port, shared/idempotent per root, path-traversal guarded —
  `resolveStaticPath`). Bridge `serve.start/stop/info`. **Run & Serve → "Host this
  folder"** serves the workspace and opens it in the browser (Stop button +
  reflects an already-running server).
- **In-IDE HTML preview**: a Preview/Edit toggle on `.html` files (FileViewer)
  renders the page live in an `<iframe>` served by the host server so CSS/JS and
  relative paths resolve like a real browser; **Reload** + **Open in browser ↗**.
  CSP gained `frame-src http://127.0.0.1:* http://localhost:*`. `HtmlPreview.tsx`.
- **AI roll-back** (`AiPanel`): every applied agent batch snapshots prior file
  contents (`applyFiles` already had `old` per file); an "↩ AI changes (N)" list
  above the composer reverts any batch this session — restoring modified files
  and deleting ones the batch newly created. Session-scoped (in-memory).

---

## 1d. Daily essentials (live-reload · find/replace · git · problems)

- **Editor live-reload**: `main/watcher.ts` (fs.watch recursive, debounced,
  `shouldIgnore` tested) → `fs.onChanged`. App reloads open tabs with NO unsaved
  edits across all groups (`useEditorTabs.reload`), warns (no clobber) for dirty;
  Explorer also refreshes on the event. Recursive-watch failure (Linux) falls
  back to the 10s poll.
- **Find & Replace across files**: Search view has a Replace row + "Replace All"
  (confirm w/ file count). `main/search.ts` `replaceInFiles` + pure
  `replaceAllCaseInsensitive`/`escapeRegExp` (tested). In-file F&R is Monaco's
  built-in Ctrl+F/Ctrl+H.
- **Git essentials**: SCM view branch bar (switch/create), Pull/Push (system
  `git`, uses existing creds — no token storage), collapsible commit History.
  `git.ts`: listBranches/checkoutBranch/createBranch/gitLog/pull/push (tested).
- **Problems view**: activity-bar Problems panel + count badge. CodeEditor uses
  auto model URIs (no path-based models), so it's scoped to OPEN editors: each
  `FileViewer` reports its file's markers via `onDiagnostics(path, items)`; App
  aggregates `problemsByPath` (pruned on clear). `ProblemsView.tsx`.

---

## 2. How to run (one command)

```powershell
cd "C:\Users\kavee\Documents\GitHub\tabea"
npm --workspace @strix/desktop run start
```
Builds main + renderer, opens the Electron window, **and auto-starts FreeLLMAPI
on :3001**. For the AI panel to answer you must add a provider key once: open
http://localhost:3001 → **Keys** → paste a free key (Groq / Gemini / OpenRouter).

**Live-reload dev loop (preferred while developing) — `npm run dev:app`:**
`scripts/dev.mjs` runs all three tiers from one process: FreeLLMAPI (:3001,
started once and kept alive across restarts — Electron gets `STRIX_NO_AI_SERVER=1`
so a main restart never double-binds :3001), the Vite dev server (:3000), and
Electron (main+preload bundled by esbuild in **watch** mode, loaded via
`STRIX_DEV_URL`). Renderer edits **hot-reload instantly** (Vite HMR); saving any
`apps/desktop/main/**` file rebuilds (~0.3 s) and **relaunches only the window**.
Ctrl+C or closing the window tears the loop down. `dev:app:competition` for the
Competition edition. No installer rebuild needed for day-to-day work.

- Other entry points: `npm --workspace @strix/desktop run start` (one-shot
  build+launch, no watch), `npm run dev:renderer` (Vite only),
  `npm run ai:setup` (install+build FreeLLMAPI), `npm run ai:start` (server only),
  `npm run collab:start` (Yjs websocket server for opt-in collaboration).

---

## 3. Quality gates & scripts (root `package.json`)

- **`npm run typecheck`** (`tsc --build`) · **`npm run lint`** (eslint) ·
  **`npm test`** (vitest) — **all green: 445 tests / 65 files.**
  ALWAYS run all three before committing. After a renderer change also run
  `npm -w @strix/desktop run build:renderer` so the built app reflects it.
- `npm run watch` — `tsc --build --watch`. `npm run test:watch` — vitest watch.
- `npm run security` — secret scanner. `npm run security:ci` — adds critical dep audit.
- **Pre-commit hook** (`.githooks/pre-commit`, wired via `prepare` →
  `core.hooksPath`) runs the security scan on every commit.
- **CI/CD** (`.github/workflows/`): **ci.yml** runs manifest-check + security:ci +
  lint + typecheck + test + a production **build smoke** on every push to `main`
  and every PR (with npm cache + concurrency cancel). **release.yml** fires on a
  `v*` tag and builds the **Windows M1 Inno installer** + **Linux AppImage**, then
  publishes a GitHub Release (M1 only — Competition stays private). A
  `pull_request_template.md` carries the gate checklist.
- Commit messages end with the `Co-Authored-By` trailer. `feat/editions-m1` is
  merged to **`main`** (origin/main synced); tag `vX.Y.Z` to cut a release.

---

## 4. Feature inventory (what's built & where)

**Workbench shell** (`App.tsx`): custom title bar · activity bar (view switcher) ·
sidebar · editor pane · AI panel · terminal panel · status bar. Panels are
resizable (`useResizable`) and individually toggleable.

**Custom frameless title bar** (`TitleBar.tsx`): the window is `frame:false`;
Strix draws its own bar — owl brand, File/Edit/View/Go/Help menu buttons that
pop the native submenus (`win.popupMenu` → main `popupMenu`), a draggable region
(`-webkit-app-region`), and min/maximize/close window controls (`win.*` bridge).
Toasts: `toast.ts` store + `Toaster` (mounted in App) for non-blocking messages.

**Activity bar = view switcher** (left rail): Explorer / Search / Source Control /
**Extensions** (re-clicking the active one hides the sidebar), plus AI-panel &
terminal toggles, and a Settings gear pinned at the bottom.

**Extensions view** (`ExtensionsView`, sidebar): the "extensions" home — lists
supported languages (`languages.ts` registry) with ✓Installed / Install buttons.
**One-click install** runs a vetted command via `lsp.installServer(id)` (main
`languageServers.ts` execs an id→command from a HARDCODED map — renderer passes
only an id, never a command, so no injection). Shows live output + re-checks.
Currently installable: Python, TS/JS, Rust, Go, Ruby, PHP, Bash; C/C++ manual.

**Explorer** (`FileTree`): collapsible tree, colour-coded file-type SVG glyphs,
active-file highlight, right-click **context menu** (New File/Folder, Rename,
Delete via `ContextMenu` + `PromptDialog`; delete confirms).

**Split editors** (`Ctrl+\` / View menu / command): two independent editor
groups side by side (App keeps `tabs` + `tabsB`, `split`, `activeGroup`;
`activeTabs` = focused group). Clicking a group focuses it; new opens / save /
status bar / AI panel follow the focused group. `renderGroup()` in App. The
CodeEditor is keyed by `path` (fixes stale content + LSP per file).

**Editor** (`FileViewer` → `@strix/editor` Monaco): multi-file **tabs**
(`EditorTabs`/`useEditorTabs`, per-tab dirty buffers), **breadcrumbs** bar,
syntax highlighting for ~25 languages, inline AI autocomplete, Ctrl+G
generate-from-comment, LSP diagnostics → Monaco markers, **Markdown preview**
toggle for `.md`, **Format Document**.

**Search** (`SearchView` → `search.find`): workspace-wide substring search,
grouped by file, click to open. **Ctrl+Shift+F**.

**Source Control** (`SourceControlView`): lists git changes (M/A/D) split into
Staged / Changes; per-file **stage (+) / unstage (−)**, **Stage all**, a commit
message box and **Commit** — via `git.stage/unstage/stageAll/commit`
(isomorphic-git in main; author from git config, fallback Strix identity). Click
a file → read-only **diff vs HEAD** (`DiffView` + `git.fileHead`).
`useGitStatusState` exposes `reload` so the view refreshes after each op.

**AI panel** (`AiPanel` → `@strix/ai-gateway`): chat / explain / vuln-check /
Fix / Refactor, model picker (default Auto), persistent history, streaming,
diff-proposal apply (`CodeProposal`). **Ask Claude Code** button hands the
question + file off to a Claude Code terminal session. **Selection toolbar**: a
Monaco content-widget floats over a code selection with Explain/Fix, which run
the AI on just that snippet (FileViewer `onSelectionAction` → AiPanel
`selectionRequest`).

**Terminal** (`TerminalTabs`/`Terminal`): xterm.js + node-pty, multiple sessions,
opens in the workspace root. **Claude Code launcher** — a "✦ Claude Code" button
(+ "Start Claude Code" command/menu) detects the `claude` CLI via
`terminal.hasCommand` and boots it in an integrated terminal (install hint if
missing). It edits files on disk → changes appear live in the editor. This runs
the REAL Anthropic CLI; Strix does not bundle or re-implement it.

**Command palette** (`Palette`, **Ctrl+Shift+P**) & **Quick Open** (Ctrl+P) —
fuzzy match + highlight + recently-used first (`strix.recentCommands`).

**Zen mode** (Ctrl+K Z / Esc / command / menu): hides all chrome for
distraction-free editing. **Toasts** (`toast.ts` + `Toaster`) for non-blocking
notifications. Overlays/dialogs/menus have fade+pop animations
(respects prefers-reduced-motion).

**Settings** (`SettingsPage`/`useSettings`, gear / Ctrl+, / palette): a full
editor-area page (sectioned, searchable, Reset) — theme, font size, font family,
tab size, word wrap, line numbers, cursor style, render whitespace, minimap.
Persisted to localStorage; editor options flow to Monaco via `editorOptions`.

**Languages panel** (`LanguagesDialog`/`languages.ts`): the "extension list"
analog — lists supported languages, shows ✓installed / ✗not-found per language
server (`lsp.hasServer`), with a copyable install command. **NOT a marketplace**
(deliberate — see §8).

**Keyboard shortcuts** (global, in `App.tsx`): Ctrl+S save · Ctrl+K S save-all ·
Ctrl+B sidebar · Ctrl+` terminal · Ctrl+W close tab · Ctrl+P quick open ·
Ctrl+Shift+P command palette · Ctrl+Shift+F search · Ctrl+O open file ·
Shift+Alt+F format · Ctrl+G generate-from-comment (in editor).

**Workspace**: Open Folder, Open File, Clone-from-GitHub (welcome screen +
palette), recent folders.

**Native application menu** (`main/menu.ts`): the File/Edit/View/Go/Help bar is
a real Electron menu. App-behaviour items push a `menu:command` IPC carrying a
command id (same ids as the palette); App routes them through `runCommand(id)`
via `window.strix.menu.onCommand`. Edit uses native roles (undo/copy/paste).
Items whose shortcut the renderer keydown already owns use
`registerAccelerator: false` (shows the shortcut, lets the keystroke reach the
renderer — no double-fire). Settings owns Ctrl+, natively. **About Strix**
dialog (`AboutDialog`) reachable from Help.

**No marketplace** — "Languages & Extensions" = native language servers, not
downloadable plugins (the install commands are vetted/hardcoded in main).

---

## 5. Architecture — full file structure (as built)

```
strix/ (folder: tabea)
├── apps/desktop/
│   ├── main/              Electron main (Node, ESM) → compiles to dist/main
│   │   ├── index.ts         BrowserWindow; preload.mjs; sandbox:false;
│   │   │                    loads built renderer (or STRIX_DEV_URL); starts FreeLLMAPI;
│   │   │                    opens DevTools on the right.
│   │   ├── preload.mts    → preload.mjs (ESM). contextBridge → window.strix.
│   │   ├── bridge.ts        StrixApi TYPES (shared with renderer; no runtime).
│   │   ├── ipc.ts           registerIpcHandlers — ALL channels live here.
│   │   ├── menu.ts          native application menu → menu:command IPC
│   │   ├── fs.ts            read/write/buildFileTree + create/rename/remove (file:*)
│   │   ├── git.ts           getGitStatus + getFileHeadContent (isomorphic-git)
│   │   ├── workspace.ts     mutable currentRoot; Open Folder/File dialogs; clone
│   │   ├── search.ts        searchInFiles (workspace-wide, ignores/binary/caps)
│   │   ├── commandExists.ts PATH/PATHEXT scan → is a language server installed?
│   │   ├── languageServers.ts installServer(id) — exec a vetted install command
│   │   ├── repoName.ts      repoNameFromUrl (git URL → folder name; electron-free)
│   │   ├── terminal.ts      TerminalManager (node-pty, DI spawn)
│   │   ├── lsp.ts           LspManager (child_process, JSON-RPC framing, DI spawn)
│   │   ├── aiServer.ts      spawn/stop vendored FreeLLMAPI
│   │   └── *.test.ts        node-env vitest for fs/git/terminal/lsp/search/
│   │                        commandExists/repoName/aiServer
│   └── renderer/          React 19 + Vite (base:'./' for file:// loads)
│       ├── main.tsx         imports xterm css, tokens.css, styles.css, monaco-setup, App
│       ├── App.tsx          the workbench shell + all wiring (shortcuts, commands, dialogs)
│       ├── tokens.css       DESIGN TOKENS (primitives + semantic + light theme). Edit here to re-skin.
│       ├── styles.css       all component styles; consumes ONLY semantic tokens (no raw hex)
│       ├── index.html       has the CSP meta tag (§8)
│       ├── global.d.ts      window.strix: StrixApi (from ../main/bridge)
│       ├── test-utils.ts    makeStrixApi() — SINGLE SOURCE OF TRUTH for bridge mocks
│       └── src/
│           ├── FileTree.tsx + useFileTree.ts       tree; exports fileBadge/fileKind/FileIcon
│           ├── FileViewer.tsx                       editor host (presentational); markers→problems;
│           │                                        markdown preview toggle; registerFormat
│           ├── EditorTabs.tsx + useEditorTabs.ts    tabs + per-tab buffers + saveAll
│           ├── useFileBuffer.ts / useFileContents.ts
│           ├── Breadcrumbs.tsx                      path bar above editor (relativeSegments)
│           ├── AiPanel.tsx                          chat/explain/vuln/Fix/Refactor + model picker
│           ├── CodeProposal.tsx                     AI diff proposal apply/dismiss
│           ├── SearchView.tsx                       Find in Files UI
│           ├── SourceControlView.tsx + DiffView.tsx git changes list + diff-vs-HEAD
│           ├── GitStatusBar.tsx + useGitStatus.ts   branch + change count (status bar, left)
│           ├── StatusBar.tsx                        git · problems | Ln/Col · indent · enc · EOL · lang
│           ├── Terminal.tsx + TerminalTabs.tsx      xterm (terminal:*)
│           ├── Palette.tsx                          reusable overlay (Quick Open + Command Palette)
│           ├── ContextMenu.tsx + PromptDialog.tsx   right-click menu + naming dialog
│           ├── SettingsDialog.tsx + useSettings.ts  settings UI + persisted store
│           ├── LanguagesDialog.tsx + languages.ts   "extension list" panel + language registry
│           ├── MarkdownPreview.tsx + markdown.tsx   safe MD→React renderer (no innerHTML)
│           ├── icons.tsx                            all inline SVG icons (Codicon-style)
│           ├── lspClient.ts                         LSP client (handshake → Monaco markers); languageForLsp
│           ├── autocomplete.ts                      Monaco inline-completions (AI ghost text)
│           ├── collab.ts                            Yjs collaboration (opt-in, dynamic-imported)
│           ├── monaco-setup.ts                      self-hosted Monaco workers (loader.config)
│           └── useResizable.ts                      draggable panel dividers
├── packages/
│   ├── ai-gateway/   @strix/ai-gateway — client(configureAi), tasks, context(buildPrompt),
│   │                 stream(streamToPanel), status(StatusTracker),
│   │                 request(runTask + model override + complete()), types(TaskType, ChatMessage)
│   ├── editor/       @strix/editor — CodeEditor (wraps @monaco-editor/react), DiffViewer,
│   │                 languageForPath (~25 langs), parseGenerateComment, EditorOptions
│   └── terminal/ lsp/ collab/ ui/   placeholders — real logic lives in apps/desktop/main
├── freellmapi/      VENDORED FreeLLMAPI (own copy, not a submodule);
│                    node_modules/dist/.env/*.db are gitignored
├── scripts/         security-scan.mjs, ai-setup.mjs
├── .github/         workflows/ci.yml, agents/strix-*.agent.md
└── ARCHITECTURE.md  AGENTS.md  PROGRESS.md(this)  package.json  tsconfig*.json
```

### The IPC bridge — `window.strix` (typed in `apps/desktop/main/bridge.ts`)
- **fs:** `read(path)` · `write(path, content)` · `tree(root)` ·
  `create(path, 'file'|'directory')` · `rename(from, to)` · `remove(path)`
- **workspace:** `root()` · `open()` (folder picker) · `openFile()` ·
  `clone(url)` — root is mutable, lives in `main/workspace.ts`
- **git:** `status(root)` → `{isRepo, branch, files[]}` · `fileHead(path)` →
  committed content (for diffs)
- **search:** `find(query)` → `{path, line, text}[]`
- **terminal:** `create(opts{cwd})` · `input(id,data)` · `resize(id,c,r)` · `kill(id)` ·
  `onData(cb)` · `onExit(cb)` · `hasCommand(cmd)` → bool (Claude Code detection)
- **lsp:** `start(language)` · `send(id,msg)` · `stop(id)` · `onMessage(cb)` ·
  `hasServer(command)` → bool · `installServer(id)` / `uninstallServer(id)` →
  `{ok, output}` (vetted commands) — supported: python/typescript/javascript/c/cpp/bash/rust/go/ruby/php
- **ai:** `config(url?)` → `{baseURL, apiKey}` · `models(url?)` → string[] — the
  optional url points at a **shared FreeLLMAPI host** (Settings → AI server URL);
  blank = local. CSP allows `http://*:3001`. Packaged exe is IDE-only (no bundled
  server). Team model in `docs/TEAM_SETUP.md`. **Direct provider:**
  `directStart(id,{baseURL,apiKey,model,messages,temperature?,maxTokens?})` +
  `directCancel(id)` stream an OpenAI-compatible completion from main (no CORS);
  tokens arrive via `onDirectToken`/`onDirectDone`/`onDirectError` (id-keyed).
- **collab:** `url()` → string|null (COLLAB_SERVER_URL)
- **menu:** `onCommand(cb)` → unsubscribe (native menu → renderer command ids)

> **When you add a bridge method:** update `bridge.ts` (type), `preload.mts`
> (impl), `ipc.ts` (handler), AND `renderer/test-utils.ts` `makeStrixApi`
> (default) — or every renderer test fails typecheck. Put pure logic in its own
> electron-free module (like `search.ts`/`commandExists.ts`/`repoName.ts`) so it's
> unit-testable without spawning Electron.

---

## 6. Design system (tokens) — how to restyle

- `renderer/tokens.css` is imported **before** `styles.css` in `main.tsx`. Two layers:
  1. **Primitives** — raw palette (`--gray-900`, `--blue-600`, file-type `--c-ts`…)
     + scales (`--space-*`, `--radius-*`, `--text-*`, `--weight-*`, `--ease`).
  2. **Semantic** — intent tokens (`--bg`, `--bg-elevated`, `--text`, `--accent`,
     `--border`, `--dirty`, `--danger`, `--scrim`, `--shadow-modal`, …).
- `styles.css` references **only semantic tokens** (no raw hex). Re-theming or
  adding a theme = edit `tokens.css` only.
- **Themes:** `[data-theme]` blocks for dark (base) / light / midnight /
  high-contrast (surfaces/text only). **Accents:** `[data-accent]` blocks
  (amber/violet/teal/emerald/blue) own the accent-family tokens. `useSettings`
  sets both `dataset.theme` + `dataset.accent`. The Monaco editor accent follows
  via `monaco-setup.applyAccent(hex, themeName)` (re-defines strix-dark/light).
  Catalogue + helpers in `themes.ts`. Pick both in the Settings page.
- **Editor (Monaco) theme:** custom `strix-dark` / `strix-light` defined in
  `monaco-setup.ts` (amber cursor + active line-number, amber-tinted selection /
  bracket-match / indent guides, subtle current-line highlight, matched bg).
  Modern options live in `MODERN_OPTIONS` in `packages/editor/src/index.tsx`
  (padding, Cascadia ligatures, smooth caret, bracket-pair colourization, indent
  guides). `CodeEditor`/`DiffViewer` take a `theme` prop; App derives it from
  `settings.theme` and threads it through FileViewer/DiffView.
- **Brand identity = Strix amber** (`--accent: #e8a33d`, "owl eyes in the dark").
  Amber fills use **`--accent-ink`** (near-black) for legible text, NOT white.
  The status bar is the signature amber stripe (`--statusbar` + `--statusbar-ink`).
  Selected rows use a translucent amber **wash** (`--selection`) + an amber accent
  bar, keeping light text legible. There's an **owl logo** (`OwlIcon` in icons.tsx)
  in the title bar and on the welcome screen; the "Strix" wordmark is an amber
  gradient. If you change the accent, also revisit `--accent-ink`/`--statusbar-ink`.

---

## 7. FreeLLMAPI (the AI backbone)

- **It is a router/proxy, NOT a model.** One OpenAI-compatible endpoint
  (`:3001/v1`) forwarding to ~14 free-tier providers (Gemini, Groq, Cerebras,
  Mistral, OpenRouter, …) with automatic failover. `model: 'auto'` uses its
  fallback chain — this IS the "auto-switch when tokens run out" behaviour.
- **Vendored** at `freellmapi/`. Run `npm run ai:setup` after a fresh clone to
  install+build+generate its `.env` key.
- **Auto-started** by `apps/desktop/main/aiServer.ts` (`node
  freellmapi/server/dist/index.js`). Disable with `STRIX_NO_AI_SERVER=1`.
- **Unified key** lives in its SQLite DB; renderer fetches it live via
  `ai.config()` → `GET :3001/api/settings/api-key` (no `.env` copying). Auth
  check is in `freellmapi/server/src/routes/proxy.ts`.
- **Storage = sql.js (WASM), NOT better-sqlite3.** As of the "Option B" swap the
  DB engine is **pure-JS sql.js** behind a better-sqlite3-compatible adapter
  (`freellmapi/server/src/db/sqljs-adapter.ts`). This removes the **only** native
  module from the server so it bundles into `Strix.exe` and runs under Electron's
  Node with **no ABI rebuild** — ever, on any OS. Consequences to remember:
  - `initDb()` is now **async** (sql.js loads WASM async); all callers `await` it.
  - The adapter only covers what FreeLLMAPI uses: `prepare().{get,all,run}`
    (positional params), `exec`, `pragma` (WAL is a no-op), `transaction` (nestable
    via savepoints), `close`. `get/all` return `unknown`/`unknown[]` (like
    better-sqlite3) so `as Row` casts at call sites are unchanged.
  - DB persists by writing the whole file on each top-level write; path is
    `FREELLMAPI_DB_PATH` (Strix passes `app.getPath('userData')` when packaged).
  - **Deployment model is now local-per-machine**: each Strix bundles + auto-starts
    its **own** server (blank `aiServerUrl`). The shared-host option still works but
    is no longer the default. See `docs/PACKAGING.md`.
  - **Unverified in sandbox** (sql.js isn't installed here): production code
    typechecks, but run `npm install` + `npm -w @freellmapi/server test` + a real
    `package:dir` build to validate the adapter and the bundled WASM.

---

## 8. Key decisions & hard-won gotchas (don't re-learn these)

1. **Sandbox vs real machine:** the assistant's shell runs in a sandbox where the
   **project dir is shared** with the user's machine, but **global installs
   (npm -g) and `AppData` are NOT.** The user runs the GUI; the assistant verifies
   via builds/tests. Cannot launch Electron/GUI from assistant tools — user sends
   screenshots.
2. **Electron preload must be ESM `.mjs`** (`preload.mts` → `preload.mjs`) with
   `sandbox:false`; a `.js` ESM preload throws "Cannot use import statement".
3. **Vite build must run via npm script** (`build:renderer`), not `npx vite` from
   the subdir. `vite.config.ts` uses `import.meta.url` (ESM) + `base:'./'` so
   assets load over `file://`.
4. **Monaco is self-hosted** (`monaco-setup.ts` wires workers via Vite `?worker` +
   `loader.config({monaco})`); the CDN default fails under `file://`. Editor needs
   real width (FileViewer is in a `flex:1` column). Monaco **bundles grammars** for
   ~50 languages — adding highlighting = just map the extension in `languageForPath`.
5. **CSP** is set via a meta tag in `index.html` — deliberately **no
   'unsafe-eval'** (cleared the Electron insecure-CSP warning, verified live). If
   the editor ever renders blank, widen `script-src` or remove the tag to diagnose.
6. **No VS Code-style extension marketplace** (decided): VS Code extensions need
   the VS Code API to run and downloading/executing third-party code is a security
   surface that conflicts with the "vulnerability-proof" mandate. Strix uses a
   native language **registry** + the Languages panel instead.
7. **Markdown preview** renders to **React elements, never `dangerouslySetInnerHTML`**;
   dangerous link targets (`javascript:`) are downgraded to text. No XSS surface.
8. **git status/diff** use `git.findRoot` so they work from a subdirectory.
9. **LF→CRLF git warnings on Windows are benign.**
10. **Windows LSP spawn** needs `shell: true` to resolve `.cmd/.exe` shims
    (typescript-language-server, pylsp).
11. **Bundle is ~4 MB** (full Monaco) — functional; code-split later.
12. **120 commits ahead of origin/main** (local) — user pushes manually.

---

## 9. Build phases (ARCHITECTURE §10) status

| Phase | Scope | Status |
|---|---|---|
| 1 | Monorepo, tooling, CI | ✅ |
| 2 | Editor, file tree, tabs, open/save, syntax | ✅ |
| 3 | FreeLLMAPI deployed locally | ✅ (user adds provider key) |
| 4 | AI gateway + all §8 editor features | ✅ chat/explain/vuln/autocomplete/Fix/Refactor/generate/model-picker/context |
| 5 | Terminal + LSP | ✅ terminal; LSP diagnostics (Py/TS/JS/C/C++/Bash/Rust/Go). Hover/go-to-def TODO |
| 6 | Yjs collaboration | ✅ opt-in (`collab.ts`; COLLAB_SERVER_URL + `npm run collab:start`) |
| 7 | Hex viewer / CTF / vuln linter | 🚧 hex viewer done (`HexViewer`, `fs.readBytes`, auto on binary + Hex/Text toggle); CTF/vuln linter TODO |
| 8 | Packaging / installers | 🚧 electron-builder config + AI-server-as-node fix (`docs/PACKAGING.md`); needs a real Windows build + freellmapi writable-DB fix |

---

## 9g. Session update — 2026-07-11 (workbench + AI-panel batch)

- **Commit-message AI generate** — was CORS-blocked: `complete()` ran in the
  renderer against localhost:3001 (blocked from the packaged `file://` origin).
  New `aiComplete.freellmComplete()` routes one-shot completions through the main
  process (`ai.freellmStart` IPC). (Same latent issue affects autocomplete /
  Ctrl+G — candidates to reroute next.)
- **Empty-explorer root actions** — click/right-click the empty file tree → root
  New File / New Folder.
- **Git dirty-diff gutter** — changed lines vs HEAD in the editor margin
  (`dirtyDiff.computeLineHunks`, pure LCS, tested) + overview-ruler marks.
- **Drag & drop** files/folders into folders to move them (`fs.rename`), with a
  drop highlight; guards self/descendant drops.
- **Agent modes** (Manual / Accept-edits / Plan) in the AI toolbar; Plan injects
  a plan-only directive and makes no edits. Apply/auto-fix gates key off the mode.
- **`/agent` slash menu** in the composer — pick a coding-agent preset to run it
  against the project in chat.
- **Ctrl+N untitled buffer → Ctrl+S save-as** — `useEditorTabs.openUntitled()` +
  `workspace.saveAs` (native Save dialog, defaults into the workspace).
- Version bumped to **0.2.0**; published to the update feed (M1 + Competition).

## 9k. Session update — 2026-08-02 (updater: apply actually works, all-users included)

Symptom: "update, hit Restart, and it won't open." The installer downloaded and verified
(117MB staged in temp) but **no Inno log was ever written** — it never ran — and the install
stayed at 0.2.12. Two silent failures stacked:

- `update:apply` spawned the installer then called `app.quit()` on an unconditional 1200ms
  timer. `spawn()` reports launch failures via an **'error' event, not a throw**, so the
  surrounding try/catch never fired: a declined UAC prompt closed the app and installed nothing.
- `UpdateBanner` called `void window.strix.update.apply()` and **discarded the result**, so even
  a returned error displayed nothing.

Fixed in `main/launchInstaller.ts` — the app now quits only after the install demonstrably began:

- All-users updates pass `/ALLUSERS` and let **Inno raise the UAC prompt itself** instead of
  pre-elevating via `Start-Process -Verb RunAs`. Inno then records the original non-elevated
  user, which is what makes the new `runasoriginaluser` flag on the silent `[Run]` entry work —
  without it an all-users update **relaunched Strix as administrator**.
- Success is observed, not guessed: Inno writes its `/LOG` only once installation starts, so the
  launcher resolves ok when that file appears and treats "exited without ever writing one" as a
  declined prompt. A stale log is deleted first so it cannot fake success.
- On failure the banner explains that administrator approval is needed.

**Not yet verified end-to-end against a real UAC install** (needs an elevated run on the target
machine) — but a failure now reports its reason instead of vanishing. 499 tests.

## 9j. Session update — 2026-08-02 (UI slice 1 — design language, SCM, AI composer)

Spec: `docs/superpowers/specs/2026-08-02-ui-redesign-design.md` ·
Plan: `docs/superpowers/plans/2026-08-02-ui-redesign.md` (executed task-by-task with review gates)

- **Control tokens** (`tokens.css`) — `--control-h: 28px`, `--control-h-sm`, `--control-radius: 7px`,
  `--card-radius`, `--field-h`, `--panel-gutter: 12px`, `--panel-gap`, `--section-gap`, plus
  `:root[data-density='compact']` overrides so compact mode scales the tokens themselves. Additive:
  no existing `--space-*` / `--radius-*` value changed, so untouched surfaces cannot shift.
  `--text-2xs` 9px → 10px; **9px is no longer used for anything meant to be read.**
- **Agent mode moved into the composer** (`AgentModeControl.tsx`) — it decides whether the AI writes
  to your files, and it used to be 9px text in the corner of the model toolbar. Now a 28px segmented
  control beside Send, icons per mode, roving-tabindex radiogroup with arrow keys that move focus as
  well as selection. Accept-edits tints the composer so the state is ambient.
- **Source Control hierarchy** — `BranchMenu.tsx` replaces a bare `<select>` AND the always-visible
  "New branch…" row; sync verbs sit under the branch button; **Create Pull Request moved to a `⋯`
  overflow menu** so `Commit on <branch>` is the only primary action; one shared `--panel-gutter`
  gives the panel a single left edge; a clean tree gets a real empty state.
- **`useDismiss.ts`** — Escape / outside-click dismissal shared by both panel menus (the overflow
  menu shipped without it and stayed stuck open; caught in review).
- 492 tests (from 463). `AiPanel.tsx` shrank 2272 → 2252; `SourceControlView.tsx` at 497/500.
- Later slices reuse these tokens: explorer, tabs, terminal, settings, palette, status bar.

## 9i. Session update — 2026-08-02 (self-hosted update feed)

- **Strix can host its own update feed** (`main/updateFeed.ts`, 0.2.13). Updating
  used to need `npm run update:serve` running in a terminal; close it and "Check
  for Updates" had nothing to talk to. A build made with `--selfhost` serves the
  feed folder itself while the app is open.
- **Opt-in and deliberately narrow** — it is an HTTP server inside a desktop app:
  `__STRIX_UPDATE_SERVE_DIR__` is only baked when building with `--selfhost`, so
  public releases never listen and embed no build-machine path; binds `127.0.0.1`
  only (verified unreachable from the LAN); serves only `.json` + `.exe` resolved
  inside the root (plain and percent-encoded traversal refused); `EADDRINUSE` is
  treated as success; stopped on `will-quit`.
- Build with `npm run package:m1:selfhost`, or `update:ship:selfhost` to publish
  in one step.
- Note: `dist-updates/` holds every installer since 0.2.0 (~2.2 GB) — prune old
  ones periodically; only the version in `latest-m1.json` is needed.

## 9h. Session update — 2026-08-02 (git stash + smart branch switch, zoom)

- **Branch switching no longer dead-ends on a dirty tree** — git correctly
  refuses a checkout that would clobber uncommitted edits; Strix used to just
  flash a raw error. Now the Source Control view detects the conflict and shows a
  **"Stash & switch?"** confirm bar: it stashes, switches, and points you at the
  new **Stashes** panel to restore. Root-caused with a repro (isomorphic-git
  `checkout` is fine on non-conflicting dirty files but throws `CheckoutConflictError`
  when a dirty file also differs on the target branch — same as system git).
- **Full stash panel** (`git.ts` + `StashList.tsx`) — system-git-backed
  `stashList/Push/Pop/Apply/Drop` (IPC `git:stash*`), a **Stash** action in the
  Changes header, and a Stashes section with pop/apply/drop per entry.
- **Ctrl/Cmd + wheel (touchpad pinch) zoom for every file view** (0.2.9) — Monaco
  `mouseWheelZoom` for code; FileViewer scales Markdown/HTML preview + notices via
  CSS `zoom`. Per-file, resets to 100% on open.
- Note: 23 `npm audit` findings remain — all **devDependencies** (electron-builder,
  vitest/vite, electron); prod deps are 0. They need deliberate major upgrades on a
  separate branch (a blind `npm audit fix` regressed 23→37).

## 9g. Session update — 2026-07-13 (v0.2.1 → v0.2.6: fixes batch)

Shipped via the live updater; each `chore: bump` builds + `update:publish`.

- **AI chat now edits the open file** (0.2.6). Polite edit requests ("can you fix
  this") were misrouted to plain chat (isQuestion caught can/could) → it only
  replied with code. New `isEditIntent` (strips politeness) + `editOpenFile`:
  when a file is open and you ask to change it, it fetches the full updated file
  and applies per **agent mode** — Accept-edits writes to the editor, Manual
  shows a diff to approve (CodeProposal), Plan describes only.
- **Agent modes** (0.2.1) — Manual / Accept-edits / Plan selector in the AI
  toolbar (maps onto autoApply); per-file action buttons removed (mode-driven).
- **Renderer-direct AI CORS fix** (0.2.3, `main/aiCors.ts`) — packaged apps load
  from `file://`; the local FreeLLMAPI CORS rejected that origin, silently
  breaking autocomplete, Ctrl+G generate, selection Fix, agents, and FreeLLMAPI
  chat. Main injects `Access-Control-Allow-*` on loopback `/v1|/api` responses.
- **Updater robustness** (0.2.5) — detect a rebuild at the SAME version via a
  git-hash **buildId** baked in (`__STRIX_BUILD_ID__`) + in the manifest; a
  failed check no longer masquerades as "up to date"; the banner shows the version.
- **Folder drag-drop** (0.2.6) — the real fix: hold the dragged path in module
  state (dataTransfer.getData returns '' on drop in Electron). Also per-group
  **split close** (× closes the clicked group, shifts the rest) and AI
  **copy / rewind-to-here** per message.
- **Live-preview + `/agent` menu + untitled/save-as** (0.2.0–0.2.1).

## 9f. Session update — 2026-07-11 (perf: git-status polling)

- **Fix — high CPU/RAM while editing / in preview.** Root cause: `useGitStatus`
  ran `git.statusMatrix` (re-hashes the whole working tree) on a **blind 4s
  `setInterval`**, mounted app-wide always — so Strix re-hashed the repo every 4s
  even with SCM closed while editing (and during HTML preview, since it's global).
  Now event-driven: refresh on `fs:changed` (800ms debounce) + window focus +
  visibility, with an in-flight guard and a slow 30s safety net **skipped while
  the window is hidden**. `useGitStatus.test.tsx` locks in: no blind poll,
  debounced fs-refresh, hidden-skip.

## 9e. Session update — 2026-07-11 (live web preview + two fixes)

- **Live web preview** (spec: `docs/superpowers/specs/2026-07-11-live-web-preview-design.md`).
  A dedicated **Live Preview** tab (editor-area overlay) runs the project's dev
  server and embeds the running app in an Electron `<webview>`, live-updating via
  the dev server's own HMR — the whole functional site, not the static HTML render.
  - **`main/devServer.ts`**: one managed dev-server child per root; scans stdout
    line-by-line for the served URL (`detectServerUrl`, pure + tested), emits
    `preview:url/log/exit`, kills the process tree on stop. `webviewTag: true` in
    index.ts; webview external links routed to the OS browser.
  - **IPC** `preview:start/stop/status` (+ events); **`renderer/src/LivePreview.tsx`**
    with reload · open-external · responsive Desktop/Tablet/Mobile · DevTools · logs.
    Plain HTML/JS (no dev script) → static-host fallback + reload-on-save.
  - Opened from **Run & Serve** ("Open Live Preview") or the command palette
    ("Preview: Open Live Preview"). Verified end-to-end (real child process:
    spawn → URL scrape → tree-kill).
- **Fix — terminal/FreeBuff resize smear** (commit e7383da): the terminal resized
  ConPTY every animation frame during a resize drag, smearing the TUI; now a
  trailing debounce fits once the drag settles.
- **Fix — new FreeLLMAPI key not picked up** (e7383da): Settings is an overlay
  over the mounted AI panel, so an added key never refreshed it; Settings now
  broadcasts `strix:ai-keys-changed` and the panel re-loads config/models/keys.

## 9d. Session update — 2026-07-11 (live auto-update)

- **Live auto-update** (spec: `docs/superpowers/specs/2026-07-11-live-auto-update-design.md`).
  On launch the app checks an update server; a newer version shows a banner
  (**Update now** → download + **sha256-verify** → **Restart to apply**). Updates
  install silently (per-user, no UAC) and relaunch.
  - **Pure core** `apps/desktop/main/updater.ts` (no electron import →
    unit-tested): `compareVersions`, `parseManifest`, `checkForUpdate`,
    `downloadAndVerify` (streams + verifies, deletes + throws on mismatch).
  - **IPC** in `ipc.ts`: `update:check` / `:download` / `:apply` + pushed
    `update:available/progress/ready/error` events. Feed URL =
    `STRIX_UPDATE_URL` env → `__STRIX_UPDATE_URL__` build define → localhost:8787.
  - **UI** `renderer/src/UpdateBanner.tsx` (self-contained state machine; launch
    check silent on error, manual check via Help → *Check for Updates…*).
  - **Installer** `build/installer.iss`: `PrivilegesRequired=lowest` +
    `PrivilegesRequiredOverridesAllowed=dialog` → a startup **"all users vs just
    me"** chooser. `{autopf}` resolves per-mode (Program Files vs
    `{localappdata}\Programs`); "Open with" keys use `HKA`. `CloseApplications=yes`
    + a `skipifnotsilent` `[Run]` entry relaunches after a silent update.
    Per-user updates apply silently; **all-users (Program Files) installs elevate
    on apply** (`isSystemInstall` → PowerShell `Start-Process -Verb RunAs`, one
    UAC per update). (Existing 0.1.0 installs need one manual reinstall to migrate.)
  - **Feed scripts**: `npm run update:serve` (static server for `dist-updates/`),
    `npm run update:publish [m1|competition]` (copies the built installer, writes
    `latest-<edition>.json` + sha256). `dist-updates/` is gitignored.
  - Also fixed a pre-existing flaky assertion in `AiPanel.test.tsx` (localStorage
    persistence is a post-commit effect → now awaited via `waitFor`).

## 9c. Session update — 2026-06-05 (feature batch)

- **Removed Hex viewer** (HexViewer/hex.ts/fs.readFileBytes/file:readBytes) — binary
  files show a notice. **Removed "Toggle Developer Tools"** from the View menu.
- **Zen mode = true OS fullscreen** (hides the taskbar) via `win.setFullScreen`.
- **Markdown/README preview** centered (max-width column, roomier leading).
- **AI commit messages**: ✦ Generate in the SCM commit box drafts a Conventional
  Commits message from the staged diff (`git.diffStaged` → `git diff --cached`,
  reply tidied by `cleanCommitMessage`).
- **Create Pull Request** (SCM): pushes the current branch and opens the GitHub
  compare page (`git.createPr`; pure URL builder `gitRemote.ts`).
- **Run & Serve panel** (new activity-bar view): detects npm scripts + Python
  entrypoints, runs them in a titled integrated-terminal tab, and **auto-opens a
  detected localhost dev-server URL** in the browser (`win.openExternal`). Pure
  detectors in `runTargets.ts`.
- **Material icon theme** (switchable, default Material): colourful per-language
  file icons + colored folders (`materialIcons.tsx`), selected via an icon-theme
  store (`iconTheme.ts`) and a Settings → Appearance → "File icon theme" picker.
- Tests: gitRemote, commitMessage, runTargets, materialIcons (214 total green).

## 9b. Session update — 2026-06-05 (security + LSP IntelliSense + AI UX)

- **Security pass:** removed unused `monaco-languageclient` (**44 → 0 npm vulns**);
  Electron nav hardening (`setWindowOpenHandler` + `will-navigate` deny/external in
  `main/index.ts`); FreeLLMAPI now **binds 127.0.0.1 by default** (was `0.0.0.0`
  with an unauthenticated key endpoint) — set `HOST=0.0.0.0` to share on a LAN.
- **LSP IntelliSense (Phase 5 hover/go-to-def — DONE):** `lspClient.ts` now does
  request/response (`sendRequest` + `pending` map) for **completion / hover /
  go-to-definition / document symbols**, with pure tested normalizers. `FileViewer`
  registers once-per-language Monaco providers. Fixed project context: server `cwd`
  = workspace root + `rootUri`/`workspaceFolders` in `initialize` (kills false
  "cannot find module … nodenext" errors from isolated-file analysis).
- **Per-project AI chat** (`AiPanel.tsx`): history keyed `strix.ai.history:<root>`;
  switching folders switches the conversation (a ref keeps saves on the right key).
- **Live Fix** (`FileViewer.tsx` selection toolbar): "Fix" now writes the AI's
  corrected code straight into the selection (one undo step); "Explain" still chats.
- **Agent reliability v2:** (1) diff/patch edits — the agent returns
  `edits:[{path,search,replace}]` for existing files (applied by exact-match
  search/replace) instead of rewriting whole files, so responses are short and
  don't truncate; full `files` only for new/near-total rewrites. Failed snippet
  matches are reported, not silently dropped. (2) builds pick a strong model
  (`pickBuildModel`) when the picker is on Auto. (3) plan-first: a short streamed
  "what I'll change" summary precedes the file plan. Plus scaffold max_tokens
  8192 and PowerShell-safe `&&`→`;` for the interactive run.
- **AI panel attachments (multimodal):** attach files to the chat via the 📎
  button, drag-drop, or paste. Images → base64 data URL (sent as OpenAI
  image_url parts for vision models like gpt-4o/gemini); PDFs → text extracted
  with pdf.js (lazy-loaded, own chunk); md/txt/code/json/csv → UTF-8 text. The
  gateway grew Attachment/ContentPart/PromptMessage types; buildPrompt appends
  attached text and emits multimodal content when images are present. Attachments
  feed chat AND the build/scaffold agent, then clear after sending.
- **Cross-platform packaging:** runtime was already portable (terminal uses
  `$SHELL`/bash off-Windows, LSP `shell:true` only on Windows, menu adapts for
  macOS, AI server is sql.js/WASM). Added electron-builder **Linux** (AppImage +
  deb) and **macOS** (dmg + zip) targets + `package:linux`/`package:mac` scripts;
  docs in `docs/PACKAGING.md` (build each OS on that OS — node-pty is the only
  native module).
- **Agentic build/edit from chat (Copilot-style):** the scaffolder now MODIFIES
  existing files, not just creates. `buildProject` feeds the model the file tree
  **plus the contents of existing text files** (`gatherProjectFiles`, capped) and
  the chat history, and the `scaffold` prompt is a "coding agent" that returns the
  full updated content of every file it changes/creates. Send routes build AND
  edit/modify requests + short confirmations ("add those", "do it", "make it more
  advanced") to this flow (questions stay chat). After applying, changed files are
  reloaded live in the editor (App `onOpenPath` close+open forces a fresh read).
- **New Project + AI builds from chat:** Welcome / File menu / palette gain
  New Project… / New File… / New Folder… (`workspace.newProject`). The AI panel
  has NO separate build button — **Send itself builds**: `looksLikeBuildRequest`
  routes "make/build/create a program/app/…" to the scaffolder
  (`complete('scaffold')` → strict JSON plan parsed/validated by `parseScaffold`/
  `isSafeRelPath`, rejects `..`/absolute/drive paths, caps count+size) → a
  confirmation modal → `fs.write` (mkdir -p) → opens the first file + posts a
  "Built it — created N files" turn. Otherwise it's a normal chat. Every code
  block also has a "Save to file" button. Iterative agent builds still via Claude
  Code.
- **Troubleshooting batch (audit + 4 enhancements):** full audit (0 vulns, clean
  scan, IPC/Electron hardening verified). Fixes: AI Stop now cancels Fix/Refactor
  + real AI failures show a toast. Additions: (1) Copy button on code blocks +
  Regenerate last reply; (2) unsaved-changes guard on tab close / window quit;
  (3) terminal font follows Settings + Format-on-save; (4) persisted panel sizes
  and per-project open-tab sessions (`strix.openTabs:<root>`, restored on launch;
  switching folders flushes unsaved edits first, then resets to one group).
- **Add provider keys from the IDE:** Settings → AI now has a "Provider API keys"
  manager (add/list/remove) that POSTs to FreeLLMAPI's `/api/keys` on the
  configured host (local by default) — users no longer need to open
  `localhost:3001`. Bridge: `ai.listKeys/addKey/deleteKey`. NOTE: the "AI server
  URL" field is the *client* connection target only; the local server's port is
  `FREELLMAPI_PORT` (default 3001) set at launch, not changed by this field.
- **Settings: full-screen + fixed exit + more options:** Settings opens as a
  full-window overlay below the 34px title bar (window controls stay reachable);
  a prominent "Done" button + Esc both close it. Left section-nav (Appearance /
  Editor / AI / Security). Added real, wired options: cursor blinking, line
  height, font ligatures, sticky scroll, bracket-pair colorization, smooth
  scrolling, scroll-beyond-last-line (all flow to Monaco via editorOptions), plus
  Reduce motion (root `data-reduce-motion`). Editor split now cycles 1/2/3 groups.
- **Settings apply live + Save button:** `CodeEditor` now pushes option changes to
  the live Monaco instance via `editor.updateOptions` in an effect (font / size /
  family / etc. update immediately instead of only on remount — `@monaco-editor/
  react` wasn't re-pushing the options prop). Settings toolbar gains a primary
  **Save** button (disk `SaveIcon`) that flushes + toasts "Settings saved".
- **AI project context:** chat/explain now receive a compact project file tree
  (`projectContext`) so "explain this project" works with no file open.
- **AI readability:** assistant messages render through `renderMarkdown`
  (`src/markdown.tsx`, XSS-safe, no new deps) with new `.ai-md` styles — code
  blocks, lists, headings, tables instead of raw `**`/```` ``` ````.

### Pending / awaiting user

- **Issue "Open Folder opens a new window":** NOT reproducible in code — every
  Open-Folder path does in-place `setRoot`; single-instance lock only focuses the
  existing window. Asked user whether a literal 2nd OS window appears vs. same
  window reloading. Likely was the old project's chat/tabs lingering (chat fixed).
  Possible follow-up: per-project open-tabs memory.
- **Team Activity (LIVE) feature — design agreed, NOT built.** Lead sees each
  member's code changes + AI summary + comments live over the network (NOT git).
  IDE auto-saves snapshots → click a member → AI report of what they changed.
  **HARD CONSTRAINT:** team server must NOT be the user's personal machine — AI
  stays local per machine; server is cloud/Pi-hosted, offline-tolerant. Awaiting
  hosting decision.
- **Git index corruption warning:** a non-OneDrive sync drive wiped the index twice
  mid-commit. User says it's now fully closed; still verify `git show --stat HEAD`
  (expect a small file count) after each commit.

## 10. Open items / next candidates

- **AI:** user adds provider key(s) at :3001 for real answers (auth is wired).
- **LSP:** diagnostics + completion/hover/go-to-def/symbols done; **code actions /
  rename / find-references** still candidates. Live IntelliSense needs the matching
  server installed (Languages panel shows which).
- **Source Control:** ✅ done — stage/commit (auto-stages), Sync/publish,
  generate-message, branch bar, history, create-PR.
- **Editor:** ✅ split editors / side-by-side (close per-group); breadcrumb
  dropdown navigation still a candidate.
- **Hardening:** ✅ renderer-direct AI CORS-fixed via main header injection
  (`main/aiCors.ts`); CSP + contextIsolation in place; 0 prod vulns.
- **Installer:** ✅ done — custom Inno Setup with an **all-users / just-me** chooser.
- **Live auto-update:** ✅ done — banner check → sha256-verified download → silent
  per-user apply; detects same-version rebuilds via git **buildId**. Phase 2
  (hosted https feed instead of the local `dist-updates/` server) is the follow-up.
- **CI/CD:** ✅ done — CI gates + build smoke on every PR; tag-triggered Release
  builds Windows + Linux artifacts. Code signing (SmartScreen) still open — CI is
  ready for `CSC_LINK`/`CSC_KEY_PASSWORD` secrets.
- **GitHub:** ✅ `main` synced. Optional: bake the OAuth **client id** for
  zero-setup "Sign in with GitHub"; "publish to a new repo" not yet built.
- **Team test phase:** remaining before wide handoff — no code signing (SmartScreen
  warns) and no first-run onboarding. AI needs a provider key.
- **Cybersec (Competition):** user wants **useful, non-CTF** features. Next ideas:
  testing workbench (Test Explorer + AI generate/fix tests), dependency/CVE panel.
  Project Map Phase 2: treemap + node-graph arrows.

---

## 11. Recent commit trail (newest first)

### Major additions since 2026-06-09 (branch `feat/editions-m1`)

**Packaging & install**
- Custom **Inno Setup** installer replaces electron-builder NSIS (`e05cd0b`,
  `973186e`): per-machine `C:\Program Files\Strix M1`, opt-in tasks (desktop
  shortcut, add-to-PATH `strix` shim, "Open with Strix" context menu, launch),
  glass wizard art (`85face6`). `scripts/edition.mjs` `win` = electron-builder
  `--dir` → verify-package → ISCC.
- **Lazy-start** + **single-file bundle** of FreeLLMAPI (`87b7813`, `5382e15`):
  esbuild ESM bundle (`scripts/bundle-ai.mjs`) → 33k files → ~26; installer
  ~161MB → ~112MB. `userData` moved off `%TEMP%` → persistent AppData (`94fc547`).

**UI / theme**
- **Modern clean-dark theme**, default accent **violet** (one-time migration),
  refined tokens (`1ab1a66`, `e82b2ce`). **Floating-panel workbench** — regions
  as rounded cards on a dark canvas, grabbable resizers (`82bbe24`, `a95beab`).
- **Liquid Glass** opt-in theme (Settings → Appearance): frosted shell + overlays
  (`b705610` → `676ad2a`). Note: CSS `backdrop-filter` only; no WebGL refraction.
- **Design-token reconcile** (`95b4d23`): radius scale bumped (md 6 / lg 8 /
  xl 12 + `--radius-pill`), ad-hoc values → tokens (`--panel-radius`, `--gap`,
  `--shadow-1/2`), and a `--font-display` (Bahnschrift → Segoe UI Variable →
  system) on wordmark / title bar / panel + section headers. Proper gear
  Settings icon (was a bulb-like shape); theme-toggle button removed (`90b7242`).
- **Layout fix** (`5dd857f`): terminal moved into the editor column → the AI
  assistant pane is now **full window height** (was cut above the terminal);
  terminal sits under the editor only (VS Code layout). Settings icon → filled
  cog (outline read as a sun). Terminal shell-picker menu opens downward (was
  clipped by the panel's `overflow:hidden`).

**Git / GitHub**
- VS Code-style **Sync** (pull→push, auto-publish branch) + human-readable errors
  (`40009d7`, `67ce32b`); **commit auto-stages** when nothing staged (`64ea6af`).
- **Clone dialog**: connect a GitHub account → search/clone your repos; **browser
  "Sign in with GitHub"** via OAuth **Device Flow** (`f6f0a37`, `5c12133`,
  `a92f974`). Needs a registered OAuth-App **client id** → set in Settings → AI
  or bake into `GITHUB_CLIENT_ID` (`edition.ts`, currently empty).

**Features**
- **Edit / delete chat turns (VS Code-style):** hovering a user message in the AI panel
  shows **✎ Edit** (loads it into the composer + truncates the thread to before it, so
  re-sending replaces that turn onward) and **× Delete** (removes the turn + its reply).
  `editTurn`/`deleteTurn` in `AiPanel`. Tests: edit loads+truncates, delete removes both.
- **Auto-fix loop skips environment errors:** the run→fix loop was retrying identical
  commands 3× when a tool wasn't installed (e.g. `'docker' is not recognized`). Now an
  `ENV_ERROR_RE` (not-recognized / command-not-found / not-installed / EACCES) **stops
  immediately** with actionable advice (names the missing tool; for Docker offers the
  non-Docker `npm run dev` path) instead of burning attempts on an unfixable code "bug".
- **BYOK provider presets + native Anthropic (VS Code-parity, both editions):** the
  direct-models add form now has a **Provider** dropdown (OpenRouter / OpenAI /
  Anthropic / Gemini / Groq / Mistral / DeepSeek / Custom) that **prefills base URL +
  model** — paste key, done (matches VS Code's BYOK picker; OpenRouter = one key →
  every model). **Native Anthropic adapter** (`aiProxy.streamAnthropic` — `/v1/messages`,
  `x-api-key`, system split out, required `max_tokens`, `content_block_delta` SSE) so a
  raw Claude API key works, not just OpenAI-shaped endpoints. `DirectModel.provider`
  (`'anthropic'` | undefined) routes via `streamDirect`; passed through directStart from
  AiPanel + agents. Tests: streamAnthropic parse/headers/system + streamDirect routing.
  (Consumer Plus/Pro *chat* subscriptions have no API — only API keys, or a vendor CLI;
  the CLI-agent registry for that is the next pass.)
- **Active model shown (always):** a chip next to the AI model picker now always shows
  the model answering this session — the direct model / picked FreeLLMAPI model, or on
  Auto the router's last-used model (falls back to "Auto · router" before the first
  reply or when the provider omits `chunk.model`).
- **Settings page comfort pass:** each section is now a calm card (elevated bg, rounded,
  padded) with hairline dividers between rows, roomier focus-ringed inputs, and the
  direct-model add form laid out as a tidy 2-column grid (provider + Add span full
  width) instead of a cramped overflowing single line.
- **Fix: new window no longer inherits the current project** — a second/New Window loads
  with `#blank` and starts on the welcome screen instead of reading the process-wide root.
- **Explorer shows the whole project:** the tree caps were far too tight (a venv
  named `open-webui-env` got walked and tripped the 60k-node cap → "list capped"
  banner). Raised to **depth 40 / 250k nodes** and parallelised the walk, so any
  realistic project renders in full (collapsed folders don't render → RAM ~the node
  objects only). Banner now only trips on pathological trees; users can still
  exclude a folder in Settings → Editor.
- **AI run auto-fix loop (bounded):** the AI run path only auto-fixed on a non-zero
  exit — but a script can print errors and exit 0 (e.g. "'…Opera' is not
  recognized"). Now `runPending` flags failure from **exit code OR error patterns
  in the output** (`OUTPUT_ERROR_RE`) and runs a **capped 3-round fix→re-run loop**:
  on failure it asks the agent to fix, and (with "apply without confirming" on)
  re-runs the corrected command automatically until it passes or 3 attempts are
  spent; otherwise each fix waits for approval then Run continues. Stops with a
  clear message after the cap.
- **More agents:** added **Performance auditor**, **Accessibility auditor**,
  **Error-handling auditor** (report-only, like the others). Roster is now 13
  monitors/auditors + custom.
- **Agents: Findings inbox** (`AgentsView` `FindingsInbox`): an aggregated section at
  the top of the Agents panel showing every auditor's latest findings (count badge,
  newest first). Each entry expands to the report and has per-entry **→ AI** /
  **→ FreeBuff** handoff plus **dismiss** (`useAgents.dismissReport` clears
  `status.report`). Hidden when empty. Tests: AgentsView.test (hidden-when-empty +
  aggregate/handoff/dismiss, +2).
- **Multi-window (one window per project):** relaunching Strix (or **File → New
  Window**, Ctrl+Shift+N) opens a NEW window in the same process — no duplicate AI
  server/port conflicts. Made safe for real multi-project use: **watchers are keyed
  per window** (`watcher.ts` Map by webContents id; window B no longer steals window
  A's file events; cleaned up on window destroy), **LSP servers spawn in the calling
  window's root** (`lsp.start(language, root?)` through bridge/preload/ipc;
  lspClient passes `rootPath`), menu commands route to the **focused** window, and
  window controls/dialogs were already per-sender. Tabs/AI history are per-project
  (localStorage keys include the root). **Pre-handoff audit fix:** Search / Replace /
  `terminal:exec` / terminal-cwd used the process-wide `getRoot()` (single value), so a
  second window searched the *last-opened* project. Added a per-window root map in
  `ipc.ts` (keyed by `sender.id`, set on `fs:watch`, cleaned on window destroy) — these
  now use `rootFor(event)`. IPC handlers register once (not per window), menu `send`
  targets the focused window → no double-registration.
- **Live HTML preview after AI Apply:** applying AI changes previously did
  close+open on the file (remounted the viewer → preview panel reset) and the
  preview iframe only refreshed manually. Now `onOpenPath` **reloads the buffer in
  place** (keeps viewer state) and FileViewer bumps the preview whenever the
  on-disk content changes (clean reload or save — typing doesn't reload the
  iframe), so the HTML preview is live for AI applies / agent writes / saves.
- **Run → "Fix with AI" (session continues after a run):** run tabs (Run & Serve /
  AI run) now capture their output (8 KB tail); a **Fix with AI** button on the
  active run tab hands `command + ANSI-stripped output` to the AI composer
  (one-click handoff — user reviews, presses Send). Chosen over exit-code
  detection because runs execute inside a persistent shell (no exit event when
  the program window closes).
- **AI rollback verified + covered:** revert logic confirmed sound (restores prior
  content, deletes files the batch created, reopens live); added a regression test
  (apply → Revert → `fs.remove` on created + prior content rewritten).
- (Parallel session's FreeLLMAPI main-proxy stream (`ai:freellm*`) was missing its
  bridge declarations — typecheck was broken; declared `freellmStart/…` +
  `FreeLLMChatParams` in `bridge.ts` and mocked in test-utils.)
- **Local models auto-detect (Competition):** Settings → AI → "Detect local models
  (Ollama / LM Studio)" probes `127.0.0.1:11434/api/tags` (Ollama) + `:1234/v1/models`
  (LM Studio) from the **main process** (`aiProxy.detectLocalModels`, fast timeout, no
  CORS) and one-click adds each as a direct model — no URL/model typing. They run
  through the existing direct-model streaming (Ollama speaks the OpenAI-compatible API
  at `/v1`), appear in the AI panel picker, and the bottom of the agent model dropdowns.
  Bridge `ai.detectLocal`; detect button gated `IS_COMPETITION` (manual direct-add stays
  both editions). Tests: detect maps Ollama tags + LM Studio + empty-when-down (+2).
- **Big-project performance (fixes 4 GB RAM / 40% CPU / crash on large repos):**
  - **`buildFileTree` capped + cheaper** (`main/fs.ts`): was `maxDepth:Infinity` and a
    per-file `fs.stat`. Now depth 12 + **60k-node cap** (flags `truncated`), uses dirent
    types (no per-file stat). Bounds RAM regardless of project size.
  - **Killed the 10 s full-tree poll** (`useFileTree`) that re-walked the entire repo
    every 10 s (the 40% CPU). Now watcher-driven, **debounced 600 ms**.
  - **Expanded ignore list** (fs tree + watcher): node_modules/.git/dist + build/out/
    .next/coverage/.turbo/**target**/vendor/**.venv**/venv/__pycache__/.gradle/.mvn/.idea.
    Watcher ignore matched so generated-dir churn no longer storms events.
  - **Big-file editor guard** (`packages/editor`): files > 1.5 MB drop minimap/folding/
    sticky-scroll/bracket-colour, cap `maxTokenizationLineLength` (minified bundles no
    longer lock Monaco); files > 15 MB show a notice + "Open anyway" (`FileViewer`).
  - **User excludes** (Settings → Editor → "Exclude folders", comma-separated) →
    `fs.setExcludes` applied to **every** tree walk (explorer/search/AI). New bridge
    `fs.readDir` (lazy one-level) + `fs.setExcludes`. **"Large project — list capped"**
    banner in the Explorer when truncated. (Tests: caps/ignore/readDir, +4.) Remaining
    optimization (deferred, non-critical given the cap): wire `fs.readDir` into a fully
    lazy explorer.
- **Black (OLED) theme (Cursor-style):** a new `[data-theme='black']` token block —
  true-black app canvas / titlebar / editor (`#000`), panels lifted a hair (`#0a0a0c`),
  hairline borders (`#1b1b1f`), deeper shadows. Registered in `themes.ts` THEMES +
  `monacoThemeFor('black') → 'strix-black'`, a new pure-black Monaco editor theme
  (`monaco-setup.ts`, `editor/gutter/minimap.background #000`). Picks accent like the
  other dark themes. Selectable in Settings → Appearance → Color theme. **Accents:**
  added **Red** (`#e5484d`) and **White** (`#e8e8ec`, monochrome — dark ink on white
  fills); White is the neutral/all-black accent to pair with the Black theme for the
  accent-free Cursor look. Added **Black** accent — near-black fills (`#16161a`) + light
  ink + black status stripe for a fully blacked-out OLED IDE (its `themes.ts` hex is a
  soft grey `#8a8a93` so the Monaco cursor stays legible on the black editor).
  `[data-accent='red'/'white'/'black']` token blocks + `themes.ts` ACCENTS (Monaco
  cursor/selection follow via `accentHex`). **Design-review fixes:** focus rings now
  use a dedicated `--focus` token (bright blue; darker on light theme, green in
  cybersec) instead of `--accent`, so the keyboard ring stays visible with near-black/
  near-white accents (was invisible on the Black accent); Black accent fill nudged up
  (`#1f1f26`) so filled buttons stay findable. **`--bg-app` (floating-panel canvas) is
  now theme-aware** (was a hardcoded `#030305` in `styles.css` under plain `:root`, so
  light theme showed near-black slivers in the panel gaps and Black wasn't pure `#000`)
  — moved to the token layer with per-theme overrides (light `#e4dccc`, black/HC `#000`,
  midnight `#0a0b10`). Black-accent selection wash bumped (`.12 → .17`) for readability.
- **Terminal glitch fix (`Terminal.tsx`):** stray characters / a broken first prompt
  (e.g. a leftover "ss" at the top-left) came from creating the PTY while the panel was
  still 0×0 (just-opened / mid-animation) — the shell printed its prompt at the wrong
  width and the later resize left ConPTY reflow artifacts. Now the PTY **spawns only
  once the host has a real size** (`fit` + bounded `requestAnimationFrame` retry, so a
  hidden terminal / test env still spawns), and resize events are **coalesced to one
  fit+resize per frame** (panel-drag bursts no longer smear box-drawing). `cd` on
  folder-change was already quoted (spaces safe).
- **FreeBuff in the AI Assistant panel (`FreebuffPanel.tsx`, both editions):** a
  **Strix AI ⇄ FreeBuff** segmented toggle in the AI-panel header. FreeBuff mode runs
  the agent in a real **in-panel terminal** (reuses `Terminal`, `bootCommand:'freebuff'`,
  workspace cwd + `freebuffEnv` + terminal font/cursor/shell) with install-detect
  (`terminal.hasCommand`) → one-click `npm i -g freebuff` fallback + Restart. Chosen
  over parsing FreeBuff's full-screen TUI into chat bubbles (unreliable). Mode persists
  (`localStorage strix.aiMode`). AiPanel gained `freebuffEnv`/`terminal*` props.
  **Usage bar:** the panel scrapes FreeBuff's output (`Terminal` got an `onData`
  callback) through `freebuffUsage.ts` `parseFreebuffUsage` (ANSI-stripped; matches
  "N sessions left", "X / Y", "resets in 2h 30m", "% used", tested) and shows a live
  **sessions/time-left progress bar** (red when ≤15%). Regexes are loose + tuned to
  FreeBuff's real wording — if a build's phrasing differs, the bar just stays hidden
  until the pattern is added. **Confirmed FreeBuff v0.0.112 has no headless/print/JSON
  mode** (only `login`/`--continue`/`--cwd`) — so a clean chat-bubble GUI isn't
  feasible; the embedded terminal is the chosen approach, **polished**: branded header
  (FB monogram + model chip e.g. "MiMo 2.5" + per-session "1h left" chip, both scraped
  via `parseFreebuffUsage` model/sessionLabel), Restart, and the sessions/reset bar.
  **Session persists across the toggle** — FreebuffPanel stays mounted (hidden via CSS)
  once opened, so flipping to Strix AI and back no longer kills the PTY / starts a new
  session. **FreeBuff removed from the bottom terminal** (button + launcher +
  `terminal.freebuff` command + menu item gone); hand-offs ("Ask FreeBuff", agent →
  FreeBuff, palette "Open FreeBuff") route to the embedded panel via a `freebuffSeed`
  (switches the panel to FreeBuff + seeds the prompt into the live session).
- **Agentic coding — agent roster (`src/agents/`, both editions):** a panel of
  single-purpose AI agents that **monitor & audit only — they never change code**.
  Two output modes: **doc** (keep a file current) and **report** (read-only findings).
  **10 presets** — doc: README updater, Progress tracker, Changelog drafter, TODO
  tracker, Architecture notes; report (auditors): Security auditor, Bug spotter,
  Test-gap finder, Cleanup advisor, Dependency watcher — plus **+ Custom agent**
  (doc/report). Each has its own persona, model (Auto or a direct model), and runs
  **on change (debounced 45s) + manual Run-now**, one at a time (sequential queue),
  per-agent cooldown (5 min), global **Pause**. **Handoff:** a report has **→ AI**
  (seeds the AI Assistant composer via `seedPrompt`, then the user sends to whatever
  model the picker is on — direct key / main model) and **→ FreeBuff** (hands the
  findings to a FreeBuff session) so the **main working model** does any fixing —
  agents themselves only feed results. **Safety:** all agents start disabled (opt-in);
  doc agents may only write allowlisted doc files (`isAllowedDocTarget`: safe rel
  path + `.md/.txt/.rst`); report agents touch nothing. Config persists per-workspace
  in `.strix/agents.json`
  (team-shareable). Engine: `agentRunner.runAgentModel` → `streamChatRaw` (new
  gateway export, FreeLLMAPI) or the direct-model proxy. Pure core
  (glob/scheduler/context) tested (18 tests). Activity-bar **Agents** view.
  **Lightweight runs (not a whole-model dump):** an agent run sends a cheap
  paths-only file tree (structure) + the current target (doc agents) + the
  CONTENTS of only the **changed files** that woke it (cap 8 files / 8 KB), so a
  run is "agent-sized" and doesn't exhaust free-tier rate limits (was reading 40
  files × 12 KB → 429 "all models exhausted"). Each agent only receives the
  changed files matching its own watch globs; manual Run-now reads a tiny sample.
- **Bring-your-own AI models in the model picker (direct API keys, no FreeLLMAPI):**
  Settings → AI → **Direct API key models** lets users add any number of models,
  each = label + **OpenAI-compatible base URL + API key + model id** (OpenAI,
  OpenRouter, Groq, Together, Mistral, DeepSeek, local Ollama/LM Studio). They show
  up in the **AI panel's model picker** in a "Direct API keys" group next to
  FreeLLMAPI's **Auto** + models — the user picks **per message** whether to route
  via Auto (FreeLLMAPI) or a specific direct model. Selecting a direct model streams
  that request straight to its provider with no FreeLLMAPI boot. Because the renderer
  can't call external hosts (webSecurity/CORS), direct calls **stream through the
  main process**: `main/aiProxy.ts` `streamChat` (SSE parse, tested) + IPC
  `ai:directStart`/`ai:directCancel` → `ai:directToken`/`directDone`/`directError`
  events keyed by id (mirrors the search-stream pattern). Bridge
  `ai.directStart/directCancel/onDirectToken/onDirectDone/onDirectError`. AiPanel:
  picker value `direct:<id>` → `selectedDirect`; `runTaskAny`/`completeAny` build
  messages with `buildPrompt` and drive the same onToken/onDone contract, routing to
  the chosen entry; `ensureAi` skips the FreeLLMAPI boot when a direct model is
  selected. Settings type: `aiDirectModels: DirectModel[]` ({id,label,baseURL,apiKey,
  model}); keys stored locally, sent only to that provider (via main, never the
  renderer). FreeLLMAPI Auto stays the default; both editions. (Autocomplete
  ghost-text still uses FreeLLMAPI.)
- ~~Outline / Go-to-Symbol~~ (removed — rail view + `OutlineView`/`symbols.ts`
  deleted; Monaco's built-in Ctrl+Shift+O stays), virtualized file tree + streaming search
  (`4ae6d8b`, `f710fd6`), @file typeahead + pinned chips, Find&Replace case/word.
- **Cybersec (Competition):** "Audit project" — repo-wide AI security review
  (`3c24aa9`).
- **Project Map (Competition, `1f3a9a3`):** activity-bar view — Structure (SVG
  tree, language-coloured) + Architecture (AI module graph + summary). Gated by
  `IS_COMPETITION`; pure core `projectMap.ts` tested.
- **Settings:** Terminal (font/cursor/shell), **custom keybindings**, AI tuning
  (default model/temperature/max-tokens), on-save hygiene (trim/final-newline/EOL),
  reopen-last-folder, indent-with-spaces.
- **Terminal shell picker** (▾ → PowerShell/CMD/pwsh/Git Bash) (`a95beab`).
- **AI repo-wide gather** (`a95beab`): ranks every file by relevance so big
  multi-folder projects are scanned correctly (was capped to early folders).

**Status:** typecheck + lint clean, **371 tests** pass, 0 prod vulns. Both
editions build to `Desktop\strix`. Problems tab removed from activity bar (still
in Command Palette).

---

- `4718fda` Multi-language support — native registry + Languages panel
  (rust-analyzer/gopls LSP, ~25-lang highlighting, `lsp.hasServer`, `commandExists`)
- `cfcb0b5` Format Document (Shift+Alt+F) + finalize settings batch
- `b8d677f` Settings (theme dark/light, font/tab/wrap/minimap; light theme tokens)
- `66d7e86` Markdown preview (safe MD→React renderer)
- `acf216d` Source Control view with diff vs HEAD (`git.fileHead`)
- `b71a77f` Find in Files + activity-bar view switcher (`search.find`, SearchView)
- `1373216` Fix: indentation detection no longer reports silly values
- `3fe9e1c` Security: add Content-Security-Policy (no unsafe-eval)
- `eb534a4` Save All (Ctrl+K S) · `c56d943` Recent folders · `0f2f7de` Open File
- `374cd5c` Clone from GitHub · Open Folder (mutable workspace root)
- GUI batches: VS Code makeover, design-token system, colour badges + AI panel
  redesign, file-type SVG glyphs, active-file highlight, keyboard shortcuts,
  Quick Open, Command Palette, Problems indicator, Explorer context menu + file ops
- Earlier: Phase 6 Yjs collab; Phase 5 LSP diagnostics; Phase 4 AI editor features
  (autocomplete, Fix/Refactor diff, generate-from-comment); PROGRESS.md;
  AI live-auth + model picker + context; auto-start FreeLLMAPI; vendor FreeLLMAPI;
  security gate; resizable panels; status bar; multi-file tabs; GUI shell;
  Monaco self-host; preload ESM fix; git status; xterm UI; terminal bridge;
  ai-gateway; rename tabea→strix; initial scaffold.

*(Run `git log --oneline` for the full list.)*
