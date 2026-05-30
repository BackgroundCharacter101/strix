# Strix IDE — Progress & Handoff

> **Read this first when resuming in a new session.** It captures the current
> state, full file structure, how to run, key decisions/gotchas, and what's left.
> **Keep it updated as work continues** (standing task — update with every change).
> Last updated: 2026-05-27

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
  **64 commits ahead of origin/main** — user pushes manually (assistant `gh`
  isn't authed).
- **Design source of truth:** `ARCHITECTURE.md`. Agent roles: `AGENTS.md` +
  `.github/agents/strix-*.agent.md`.

**Original scope was "the 4 core components" (file tree, editor, terminal, AI
panel).** The user has since explicitly asked to grow it toward a "simple but VS
Code-standard / top-tier" IDE with its own visual character. Still avoid
gratuitous complexity, but feature growth is now wanted.

---

## 2. How to run (one command)

```powershell
cd "C:\Users\kavee\Documents\GitHub\tabea"
npm --workspace @strix/desktop run start
```
Builds main + renderer, opens the Electron window, **and auto-starts FreeLLMAPI
on :3001**. For the AI panel to answer you must add a provider key once: open
http://localhost:3001 → **Keys** → paste a free key (Groq / Gemini / OpenRouter).

- A **main-process change** (anything in `apps/desktop/main/**`) needs a full
  restart; a renderer-only change can be picked up with **Ctrl+R** if a dev
  server is running, otherwise rebuild.
- Other entry points: `npm run dev` (Vite hot-reload; set
  `STRIX_DEV_URL=http://localhost:3000` + run `start` in a 2nd terminal),
  `npm run ai:setup` (install+build FreeLLMAPI), `npm run ai:start` (server only),
  `npm run collab:start` (Yjs websocket server for opt-in collaboration).

---

## 3. Quality gates & scripts (root `package.json`)

- **`npm run typecheck`** (`tsc --build`) · **`npm run lint`** (eslint) ·
  **`npm test`** (vitest) — **all green: 166 tests / 38 files.**
  ALWAYS run all three before committing. After a renderer change also run
  `npm -w @strix/desktop run build:renderer` so the built app reflects it.
- `npm run watch` — `tsc --build --watch`. `npm run test:watch` — vitest watch.
- `npm run security` — secret scanner. `npm run security:ci` — adds critical dep audit.
- **Pre-commit hook** (`.githooks/pre-commit`, wired via `prepare` →
  `core.hooksPath`) runs the security scan on every commit. CI
  (`.github/workflows/ci.yml`) runs security:ci + lint + typecheck + test.
- Commit messages end with the `Co-Authored-By` trailer. Work on a branch only if
  asked; current work has been committing straight to `main` (local).

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
- **ai:** `config()` → `{baseURL, apiKey}` (live from FreeLLMAPI) · `models()` → string[]
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
12. **64 commits ahead of origin/main** (local) — user pushes manually.

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
| 8 | Packaging / installers | ⛔ not started |

---

## 10. Open items / next candidates

- **AI:** user adds provider key(s) at :3001 for real answers (auth is wired).
- **LSP:** diagnostics done for 8 languages; **hover / go-to-definition / code
  actions** still TODO (would extend `lspClient.ts`). Live IntelliSense needs the
  matching server installed (Languages panel shows which).
- **Source Control:** view is read-only; an integrated **commit box** (stage +
  commit message) would be the next SCM step.
- **Editor:** split editors / side-by-side; breadcrumb dropdown navigation.
- **Hardening:** upgrade Electron (1 high CVE) & DOMPurify; consider proxying AI
  through main to keep the key out of the renderer bundle.
- **Phase 7** (cybersec panels: hex viewer / CTF / vuln linter), **Phase 8**
  (electron-builder installer — needs `node` bundled or `ELECTRON_RUN_AS_NODE`
  for the FreeLLMAPI auto-start).
- **Push to GitHub** to sync (64 commits ahead).

---

## 11. Recent commit trail (newest first)

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
