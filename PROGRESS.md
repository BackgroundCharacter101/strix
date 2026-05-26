# Strix IDE — Progress & Handoff

> **Read this first when resuming in a new session.** It captures the current
> state, architecture, how to run, key decisions/gotchas, and what's left.
> **Keep it updated as work continues.**
> Last updated: 2026-05-25

---

## 1. What this is

**Strix** — a custom, Zed-inspired desktop IDE (Electron + React + TypeScript +
Monaco) with a self-hosted AI backbone (**FreeLLMAPI**). The project was
formerly named **tabea**; the on-disk folder is still `C:\Users\kavee\Documents\GitHub\tabea`
but the project/package scope is `strix` / `@strix/*`.

- **Stack:** Electron 32, React 19, TypeScript 5 (strict), Vite 6, Monaco,
  xterm.js, node-pty, isomorphic-git, OpenAI SDK → FreeLLMAPI. Vitest, ESLint
  (flat) + typescript-eslint, npm workspaces, Turborepo.
- **GitHub:** `https://github.com/BackgroundCharacter101/strix` (private).
- **Source of truth for design:** `ARCHITECTURE.md` (repo root). Agent roles:
  `AGENTS.md` + `.github/agents/strix-*.agent.md`.

**Scope the user wants: SIMPLE — the 4 core components only** (file tree,
code/editor, terminal, AI panel). Don't add VS-Code-scale complexity unasked.

---

## 2. How to run (one command)

```powershell
cd "C:\Users\kavee\Documents\GitHub\tabea"
npm --workspace @strix/desktop run start
```
This builds main + renderer, opens the Electron window, **and auto-starts
FreeLLMAPI on :3001**. For the AI panel to answer you must also add a provider
key once: open http://localhost:3001 → **Keys** → paste a free key (Groq /
Gemini / OpenRouter / …).

Other entry points: `npm run dev` (Vite renderer hot-reload; set
`STRIX_DEV_URL=http://localhost:3000` and run `start` in a 2nd terminal),
`npm run ai:setup` (install+build FreeLLMAPI), `npm run ai:start` (server only).

---

## 3. Quality gates & scripts (root `package.json`)

- `npm run lint` · `npm run typecheck` (`tsc --build`) · `npm test` (vitest) —
  **all green: 104 tests / 26 files.**

GUI polish (user wanted all, ALL DONE): [1] collapsible file tree + badges ✅;
[2] editor-tab polish ✅; [3] IDE chrome (activity bar/panel toggles) ✅;
[4] theming (scrollbars, font smoothing, transitions) ✅.
VS Code makeover ✅: SVG activity-bar icons (48px + left accent bar), EXPLORER
sidebar header, git branch moved to bottom-left status bar (with branch icon),
rich right-side status items (Ln/Col · Spaces · UTF-8 · CRLF · language),
clean title bar (git removed), VS Code-style welcome screen on empty editor.
GUI pass 2 ✅: colour-coded file-type badges (tree + tabs, `fileKind()` →
`data-ext` → CSS); AI panel redesign (uppercase header w/ sparkle, empty-state
hint, chat bubbles restyled, primary Send + secondary file-action row,
auto-scroll thread).
- `npm run watch` — `tsc --build --watch` (live type errors). `npm run test:watch`.
- `npm run security` — secret scanner (see §7). `security:ci` adds critical dep audit.
- **Pre-commit hook** (`.githooks/pre-commit`, via `prepare` → `core.hooksPath`)
  runs the security scan on every commit. CI (`.github/workflows/ci.yml`) runs
  security:ci + lint + typecheck + test.
- **Always run lint+typecheck+test before committing.** Commit messages end with
  the Co-Authored-By trailer.

---

## 4. Architecture (current, as built)

```
strix/ (folder: tabea)
├── apps/desktop/
│   ├── main/            Electron main (Node, ESM). Compiles to dist/main.
│   │   ├── index.ts       BrowserWindow; loads built renderer (or STRIX_DEV_URL);
│   │   │                  preload.mjs; sandbox:false; auto-starts FreeLLMAPI.
│   │   ├── preload.mts  → preload.mjs (ESM). contextBridge → window.strix.
│   │   ├── bridge.ts      StrixApi TYPES (shared with renderer; no runtime).
│   │   ├── ipc.ts         registerIpcHandlers — all channels.
│   │   ├── fs.ts          read/write/buildFileTree (file:*)
│   │   ├── git.ts         getGitStatus via isomorphic-git (findRoot → repo root)
│   │   ├── terminal.ts    TerminalManager (node-pty, DI spawn)
│   │   ├── lsp.ts         LspManager (child_process, JSON-RPC framing, DI spawn)
│   │   └── aiServer.ts    spawn/stop vendored FreeLLMAPI
│   └── renderer/        React 19 + Vite. base:'./' (file:// loads).
│       ├── main.tsx       imports xterm css, styles.css, monaco-setup, App
│       ├── App.tsx        IDE shell: titlebar · sidebar · editor · ai · terminal · statusbar
│       ├── styles.css     dark theme
│       ├── global.d.ts    window.strix: StrixApi  (from ../main/bridge)
│       ├── test-utils.ts  makeStrixApi() — single source of truth for bridge mocks
│       └── src/
│           ├── FileTree.tsx + useFileTree.ts        (file:tree)
│           ├── FileViewer.tsx (presentational)      (Monaco via @strix/editor)
│           ├── EditorTabs.tsx + useEditorTabs.ts    multi-file tabs, per-tab buffers
│           ├── useFileBuffer.ts / useFileContents.ts
│           ├── AiPanel.tsx        chat/explain/vuln_check + model picker + history
│           ├── GitStatusBar.tsx + useGitStatus.ts   (title bar: "main · N changed")
│           ├── StatusBar.tsx      Ln/Col, language, dirty
│           ├── Terminal.tsx + TerminalTabs.tsx      xterm (terminal:*)
│           ├── monaco-setup.ts    self-hosted Monaco workers (loader.config)
│           └── useResizable.ts    draggable panel dividers
├── packages/
│   ├── ai-gateway/   @strix/ai-gateway — client(configureAi), tasks, context
│   │                 (buildPrompt), stream(streamToPanel), status(StatusTracker),
│   │                 request(runTask + model override + complete()), types(TaskType, ChatMessage)
│   ├── editor/       @strix/editor — CodeEditor (wraps @monaco-editor/react),
│   │                 languageForPath, exposes onCursorChange
│   ├── terminal/ lsp/ collab/ ui/   (placeholders — logic lives in apps/desktop/main)
├── freellmapi/      VENDORED FreeLLMAPI (own copy, not a submodule). Its
│                    node_modules/dist/.env/*.db are gitignored.
├── scripts/         security-scan.mjs, ai-setup.mjs
├── .github/         workflows/ci.yml, agents/strix-*.agent.md
└── ARCHITECTURE.md  AGENTS.md  PROGRESS.md(this)  package.json  tsconfig*.json
```

### The IPC bridge — `window.strix` (typed in `apps/desktop/main/bridge.ts`)
- `fs.read(path)` · `fs.write(path, content)` · `fs.tree(root)`
- `workspace.root()`  → process.cwd()
- `git.status(root)`  → `{ isRepo, branch, files[] }`
- `terminal.create(opts)` · `input(id,data)` · `resize(id,c,r)` · `kill(id)` · `onData(cb)` · `onExit(cb)`
- `lsp.start(language)` · `send(id,msg)` · `stop(id)` · `onMessage(cb)`
- `ai.config()` → `{ baseURL, apiKey }` (live from FreeLLMAPI) · `ai.models()` → string[]

**When you add a bridge method:** update `bridge.ts` (type), `preload.mts`
(impl), `ipc.ts` (handler), and `renderer/test-utils.ts` `makeStrixApi`
(default), or every renderer test fails typecheck.

---

## 5. FreeLLMAPI (the AI backbone)

- **It is a router/proxy, NOT a model.** It exposes one OpenAI-compatible
  endpoint (`:3001/v1`) and forwards to ~14 free-tier providers (Gemini, Groq,
  Cerebras, Mistral, OpenRouter, …) with automatic failover. The "AI" = whatever
  provider it routes to. `model: 'auto'` uses its fallback chain (this IS the
  "auto-switch when tokens run out" behavior — built in, not ours).
- **Vendored** at `freellmapi/` (we own it; was briefly a submodule). Run
  `npm run ai:setup` after a fresh clone to install+build+generate its `.env` key.
- **Auto-started** by `apps/desktop/main/aiServer.ts` (spawns `node
  freellmapi/server/dist/index.js`). Disable with `STRIX_NO_AI_SERVER=1`.
- **Unified key:** stored in its SQLite DB; fetch live via
  `GET :3001/api/settings/api-key`. The renderer gets it through `ai.config()`
  (no `.env` copying). Auth check is in `freellmapi/server/src/routes/proxy.ts`.

---

## 6. Build phases (ARCHITECTURE §10) status

| Phase | Scope | Status |
|---|---|---|
| 1 | Monorepo, tooling, CI | ✅ |
| 2 | Editor, file tree, tabs, open/save, syntax | ✅ |
| 3 | FreeLLMAPI deployed (locally, no Pi) | ✅ (provider keys = user) |
| 4 | AI gateway + all §8 editor features | ✅ chat (§8.2), explain (§8.3), vuln (§8.7), autocomplete (§8.1), Fix/Refactor diff (§8.4/§8.6), generate-from-comment (§8.5), model picker, persistent context |
| 5 | Terminal + LSP | ✅ terminal; LSP backend + **renderer diagnostics** (lightweight LspClient → Monaco markers, §6.5). Hover/go-to-def not done; needs a language server installed to see live |
| 6 | Yjs collaboration | ✅ opt-in (`collab.ts`; COLLAB_SERVER_URL + `npm run collab:start`) |
| 7 | Hex viewer / CTF / vuln linter | ⛔ not started |
| 8 | Packaging / installers | ⛔ not started |

---

## 7. Security gate

- `scripts/security-scan.mjs` (dependency-free): blocks commits with leaked
  secrets (private keys, AWS/GitHub/OpenAI/FreeLLMAPI keys, hardcoded creds) or a
  committed `.env`. Suppresses obvious doc placeholders. Runs via pre-commit + CI.
- `npm audit`: gate on **critical** (CI hard-fails). Known: **1 high (Electron
  32)** + DOMPurify moderates — transitive, not yet upgraded.
- Deep on-demand review: `.github/agents/strix-security-auditor.agent.md` (focus:
  IPC surface, path traversal, command injection, CSP). Use `/security-review`.

---

## 8. Key decisions & hard-won gotchas (don't re-learn these)

1. **Sandbox vs real machine:** the assistant's shell runs in a sandbox where the
   **project dir is shared** with the user's machine, but **global installs
   (npm -g) and `AppData` are NOT.** The user runs the GUI; assistant verifies
   builds/tests. Can't launch Electron/GUI from assistant tools.
2. **Electron preload must be ESM `.mjs`** (`preload.mts` → `preload.mjs`) with
   `sandbox:false`; a `.js` ESM preload throws "Cannot use import statement".
3. **Vite build must run via npm script** (`cd renderer && vite build`), NOT
   `npx vite` from the subdir — npm-exec relocates cwd to the package root and
   Vite can't find `index.html`. Also `vite.config.ts` uses `import.meta.url`
   (ESM), not `__dirname`, and `base:'./'` so built assets load over `file://`.
4. **Monaco** is self-hosted (`monaco-setup.ts` wires workers via Vite `?worker`
   + `loader.config({monaco})`); the CDN default fails under `file://`. The
   editor also needs real width (FileViewer is in a `flex:1` column).
5. **git status** uses `git.findRoot` so it works when launched from a subdir.
6. **LF→CRLF git warnings on Windows are benign.**
7. **Bundle is ~4 MB** (full Monaco) — functional; code-split later.
8. **27 commits ahead of origin/main** as of last update — user pushes manually
   (assistant's `gh` isn't authed; user authed on their machine).

---

## 9. Open items / next candidates

- **AI:** user adds provider key(s) at :3001 for real answers (auth is fixed).
- **LSP diagnostics DONE** (`renderer/src/lspClient.ts` → Monaco markers via
  FileViewer `onEditorMount`). To see squiggles live: install a server (e.g.
  `pip install python-lsp-server`) and open a matching file. Hover / go-to-def
  / code actions are still TODO (would extend LspClient).
- **Phase 4 is DONE** (all §8 AI editor features). They need a provider key +
  live window to see real output. Files: `AiPanel.tsx` (chat/explain/vuln,
  model picker, context), `autocomplete.ts` (§8.1), `CodeProposal.tsx` +
  editor `DiffViewer` (§8.4/§8.6), editor `parseGenerateComment` + Ctrl+G
  action wired in `FileViewer` (§8.5).
- **Next phases:** 7 (cybersec panels: hex viewer / CTF / vuln linter),
  8 (packaging/installers). LSP hover/go-to-def still TODO. Collab is opt-in
  & needs `npm run collab:start` + COLLAB_SERVER_URL + 2 clients to verify.
- **Hardening:** add Content-Security-Policy; upgrade Electron (1 high CVE) &
  DOMPurify; consider proxying AI through main to keep the key out of the bundle.
- **Phase 8 (packaging):** electron-builder → installable .exe (would need `node`
  bundled or `ELECTRON_RUN_AS_NODE` for the FreeLLMAPI auto-start).
- **Phase 6 collab / Phase 7 cybersec** if desired.
- **Push to GitHub** to sync.

---

## 10. Recent commit trail (newest first)

- Phase 6 Yjs collaboration (§6.6, opt-in): `collab.ts` (connectCollab via
  dynamic-imported yjs/y-websocket/y-monaco + awareness), `window.strix.collab.url`
  (COLLAB_SERVER_URL), FileViewer wiring, `collab:start` script
- `ccd7198` Fix LSP spawn on Windows (shell:true → resolves .cmd/.exe shims
  like typescript-language-server / pylsp). Servers are installed on the host
  (pip python-lsp-server + npm -g typescript-language-server).
- Phase 5 LSP diagnostics (§6.5): `lspClient.ts` (handshake + diagnostics→
  Monaco markers) wired via FileViewer `onEditorMount`
- Phase 4 generate-from-comment (§8.5): editor `parseGenerateComment` + Ctrl+G
- Phase 4 Fix/Refactor diff proposals (§8.4/§8.6): editor `DiffViewer`,
  `CodeProposal`, AiPanel Fix/Refactor → apply to active buffer
- Phase 4 inline autocomplete (§8.1): ai-gateway `complete()` + Monaco
  inline-completions provider (`renderer/src/autocomplete.ts`)
- `459aa1b` Add PROGRESS.md handoff doc
- `2a6896b` AI panel: live auth, manual model picker, persistent context
- `cac5ee5` Auto-start vendored FreeLLMAPI from Strix
- `...` Vendor FreeLLMAPI; security gate; LSP; resizable panels; status bar;
  multi-file tabs; GUI shell; Monaco self-host; preload ESM fix; build fixes;
  git status; xterm UI; terminal bridge; ai-gateway; rename tabea→strix; initial.

*(Run `git log --oneline` for the full list.)*
