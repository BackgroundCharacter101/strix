# Strix IDE — Project Overview

> A shareable snapshot of **what Strix is, how it's built, and where it stands** —
> written for a fellow developer to review and suggest features/changes.
> _Snapshot date: 2026-07-05 · ~269 commits · 423 tests passing (62 files)._
>
> **See [README.md](README.md) for the current feature list + how to run.** This
> file keeps the reviewer-oriented narrative; day-to-day status lives in
> [PROGRESS.md](PROGRESS.md).
>
> **Since the 2026-05-30 snapshot below,** Strix gained: two build-time editions
> (M1 / M1 Competition), bring-your-own direct API-key models + Ollama/LM Studio
> auto-detect, a coding-agents panel (monitors/auditors + Findings inbox), FreeBuff
> embedded in the AI panel, Run→auto-fix loop, multi-window (one project per
> window), Black/OLED theme + more accents, a custom Inno Setup installer, and big
> file-tree/perf work. The narrative below predates those — treat README/PROGRESS
> as current.

---

## 1. What it is

**Strix** is a custom, **AI-native desktop IDE** — think "a lightweight, modern
VS Code that we own end-to-end," with an integrated AI assistant baked in rather
than bolted on. It's a personal/team project (the repo folder is still named
`tabea` from an earlier name; the product is **Strix** — a genus of owl, hence
the owl logo and amber "owl-eyes-in-the-dark" accent).

**Design goals (in priority order):**
1. **Lightweight** — fast, low memory/CPU. (Idle: ~140 MB RAM, ~0% CPU — about
   half of VS Code.)
2. **Simple but modern** — the things a team needs daily, no bloat, with its own
   visual identity.
3. **AI-native** — AI help is a first-class part of the editing loop.
4. **Vulnerability-proof** — every commit is scanned for leaked secrets.

It is **not** trying to clone the full VS Code extension ecosystem (deliberate —
see §6).

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Shell | **Electron 32** (custom frameless window) |
| UI | **React 19** + **Vite 6** |
| Language | **TypeScript 5** (strict) |
| Editor | **Monaco** (the editor core from VS Code), self-hosted |
| Terminal | **xterm.js** + **node-pty** (ConPTY on Windows) |
| Git | **isomorphic-git** (pure JS, no native git dependency) |
| AI | **OpenAI SDK** → a self-hosted router (**FreeLLMAPI**) |
| Collab | **Yjs** + y-websocket (opt-in) |
| Tests | **Vitest** + Testing Library (423 tests) |
| Tooling | npm workspaces + Turborepo, ESLint (flat) + typescript-eslint |
| Target | **Windows** primarily (also cross-platform-capable) |

---

## 3. Architecture at a glance

```
┌──────────────────────────────────────────────────────────────┐
│ Electron MAIN process (Node)          apps/desktop/main/*.ts   │
│  · BrowserWindow (frameless), native menu, window controls     │
│  · File system, git, terminal (node-pty), LSP, search          │
│  · Auto-starts the FreeLLMAPI server on :3001                  │
│         ▲                                                      │
│         │  IPC bridge  (contextBridge → window.strix.*)        │
│         ▼                                                      │
│ RENDERER process (React + Vite)    apps/desktop/renderer/*     │
│  · The whole UI: title bar, activity bar, sidebar views,       │
│    editor groups (Monaco), AI panel, terminal, status bar      │
└──────────────────────────────────────────────────────────────┘
        │                                   │
        ▼                                   ▼
  packages/* (shared)                 freellmapi/ (vendored)
  · @strix/ai-gateway   AI tasks/streaming/context
  · @strix/editor       Monaco wrapper, languages, diff
                                     ↳ OpenAI-compatible router that
                                       forwards to ~14 free LLM providers
```

**The IPC bridge** is the security boundary. The renderer never touches Node
directly — it calls a typed, hand-curated surface `window.strix.*`:
`fs`, `workspace`, `git`, `search`, `terminal`, `lsp`, `ai`, `collab`, `menu`,
`win`. Anything dangerous (running a command, reading files) lives in main and
is exposed only through specific, vetted methods.

**Monorepo layout:**
```
apps/desktop/
  main/      Electron main (14 modules: fs, git, terminal, lsp, search,
             workspace, menu, languageServers, aiServer, ipc, preload, …)
  renderer/  React app (25 components + hooks; App.tsx is the workbench shell)
packages/
  ai-gateway/  AI task runner, prompt building, streaming, model routing
  editor/      Monaco CodeEditor + DiffViewer + languageForPath
freellmapi/    Vendored self-hosted AI router (own copy, not a submodule)
scripts/       security-scan.mjs (commit gate), ai-setup.mjs
```

---

## 4. Current feature set

### Editor & files
- **Multi-file tabs** with per-tab dirty state; **split editors** (two groups
  side-by-side) openable via `Ctrl+\`, a split button, **right-click → Open to
  the Side**, or **dragging a file onto a pane** / its right edge.
- **Syntax highlighting** for ~25 languages (Monaco grammars).
- **Breadcrumbs** bar, **minimap** (toggle), **format document**, configurable
  font/tab/wrap/line-numbers/cursor/whitespace.
- **Markdown preview** (safe, dependency-free renderer — no XSS surface).
- **Hex viewer** for binary files (auto-detected; Hex/Text toggle).
- File tree with colour-coded file-type icons, **right-click file ops**
  (new/rename/delete), active-file highlight.

### Navigation & UX
- **Command palette** (`Ctrl+Shift+P`) and **Quick Open** (`Ctrl+P`) — fuzzy
  matching, match highlighting, recently-used first.
- **Find in Files** (workspace-wide search) with a Search sidebar view.
- **Zen mode** (distraction-free, hides all chrome).
- **Custom frameless title bar** with working File/Edit/View/Go/Help menus and
  window controls.
- **Toast notifications**, smooth (reduced-motion-aware) animations.
- **Themes**: Dark / Midnight / High Contrast / Light + a 5-colour **accent
  picker** — the whole UI *and* the Monaco editor follow the choice.
- Full **Settings page** (sectioned, searchable), persisted.
- Activity-bar **view switcher** (Explorer / Search / Source Control /
  Extensions) with a change-count badge on Source Control.

### Git (Source Control)
- Real git client via isomorphic-git: **stage / unstage / stage-all / commit**
  (commit message box), changed-files list split Staged/Changes, and a
  **read-only diff vs HEAD** per file.

### Terminal
- xterm.js + node-pty, **multiple sessions**, opens in the workspace root,
  PowerShell default on Windows (ConPTY backend).

### AI (the "AI-native" part)
- **AI panel**: chat / explain / security-check / **Fix** / **Refactor** (with a
  diff-proposal you can apply), model picker, persistent conversation, streaming.
- **Selection toolbar**: select code → a floating **Explain / Fix** toolbar runs
  the AI on just that snippet.
- **Ask Claude Code**: hands the current file + your question to a **Claude Code**
  terminal session (uses the user's own Claude Code login — agentic, edits files
  on disk that show up live in the editor).
- The AI backbone (**FreeLLMAPI**) is a self-hosted router that forwards to ~14
  free-tier providers (Groq, Gemini, Cerebras, Mistral, OpenRouter, …) with
  automatic failover. `model: auto` = pick-and-fallback. The user adds a free
  provider key once.

### Languages & "Extensions"
- An **Extensions sidebar** that lists supported languages and, for each, whether
  its **language server** (LSP) is installed — with **one-click install**
  (`pip install …`, `npm i -g …`, etc.) and uninstall. LSP diagnostics
  (red squiggles) work per file. Supported: Python, TS/JS, Rust, Go, Ruby, PHP,
  Bash, C/C++.
- **Not a downloadable plugin marketplace** — deliberately (see §6).

### Workspace
- Open Folder, Open File, **Clone from GitHub** (in-app), recent folders.

### Collaboration (opt-in)
- Real-time co-editing via Yjs (off by default; needs a small websocket server).

---

## 5. Quality, performance, security

- **423 automated tests** (Vitest), all green. Pure logic (search, hex dump,
  git, fuzzy match, secret rules) and React components are tested against a
  mocked IPC bridge.
- **Quality gate before every commit**: `typecheck` + `lint` + `tests`.
- **Lightweight**: idle ~140 MB RAM / ~0% CPU. DevTools is off by default
  (it was a hidden ~100-300 MB drain), Monaco idle animations disabled,
  single-instance lock, no polling loops.
- **Security**:
  - A **pre-commit hook + CI** scan blocks any commit containing a leaked secret
    (private keys, AWS/GitHub/OpenAI keys, hardcoded credentials). This is a hard
    requirement of the project. _(Fun fact: it once blocked its own commit.)_
  - **Content-Security-Policy** set (no `unsafe-eval`).
  - Renderer can't run arbitrary commands — installs/launches go through vetted,
    id-keyed main-process functions (no command injection from the UI).

---

## 6. Key design decisions & trade-offs (the interesting bits for feedback)

1. **Self-hosted AI router instead of one API.** FreeLLMAPI routes to many free
   providers with failover, so there's no single bill or single point of failure.
   Trade-off: free-tier rate limits; "Auto" quality varies by which provider
   answers.
2. **No VS Code-style extension marketplace.** VS Code extensions need the VS
   Code API to run, and downloading/executing third-party code is a security
   surface that conflicts with the "vulnerability-proof" goal. Instead Strix has
   a **native language registry** + the Extensions panel (install language
   servers, not plugins). *Open question: is this the right call long-term, or do
   we need some safe extensibility model?*
3. **Two AIs, on purpose.** The built-in panel (FreeLLMAPI) is for fast, free
   inline help; **Claude Code** (the agentic CLI, launched in the terminal) is
   for deeper multi-file work. They're complementary rather than merged.
4. **Bundled Monaco, self-hosted.** No CDN; works offline. Cost: ~4 MB renderer
   bundle (load-time, not steady-state RAM). Code-splitting is a known TODO.
5. **isomorphic-git** (pure JS) so there's no native git build dependency — at
   the cost of being slower than libgit2 on huge repos.
6. **Design-token system.** All styling flows through `tokens.css` (a primitive
   palette + semantic tokens). Re-theming or adding a theme is a single-file
   edit; the Monaco editor theme is generated from the same accent.

---

## 7. Build phases — done vs. not

| Phase | Scope | Status |
|---|---|---|
| 1 | Monorepo, tooling, CI | ✅ |
| 2 | Editor, file tree, tabs, open/save, syntax | ✅ |
| 3 | Self-hosted AI backbone (FreeLLMAPI) | ✅ (user adds a free key) |
| 4 | AI editor features (chat/explain/fix/refactor/autocomplete) | ✅ |
| 5 | Terminal + LSP | ✅ terminal; LSP diagnostics (hover/go-to-def TODO) |
| 6 | Real-time collaboration (Yjs) | ✅ opt-in |
| 7 | "Cyber" tooling (hex viewer / forensics) | 🚧 hex viewer done; rest TODO |
| 8 | Packaging / installer (.exe) | ⛔ not started |

---

## 8. Known gaps / candidate next steps (where suggestions are welcome)

**Editor/workflow**
- Split editor is **two-group only** and **50/50** (no drag-resize, no 3+ panes).
- **LSP hover / go-to-definition / code actions** not wired yet (only diagnostics).
- No global "Problems" panel (counts only, in the status bar).

**Team features (currently being prioritised)**
- **Shared team config** — export/import settings + a committed
  `.strix/settings.json` so a team shares one setup. _(planned)_
- **Welcome / Get-Started tab** with recent projects + quick actions. _(planned)_
- UI density (compact/comfortable) + UI font choice. _(planned)_

**Platform / hardening**
- **Packaging**: no installer yet (electron-builder → `.exe`). Needs to bundle
  `node` (or use `ELECTRON_RUN_AS_NODE`) for the FreeLLMAPI auto-start.
- **Electron upgrade** (current has 1 known high CVE) + DOMPurify bump.
- **Code-split** the ~4 MB bundle for faster startup.
- Consider proxying AI calls through main so the key never reaches the renderer.

**Bigger questions worth a second opinion**
- Should there be a **safe extensibility model** (themes/snippets/commands) short
  of a full marketplace?
- Is **two-group split** enough, or do teams want arbitrary pane grids?
- Is the **FreeLLMAPI free-tier** model sustainable, or should it support a
  bring-your-own-key (incl. Anthropic/OpenAI) path too?

---

## 9. How to run it (for a reviewer who clones it)

```powershell
git clone https://github.com/BackgroundCharacter101/strix.git
cd strix
npm install
npm run ai:setup        # installs/builds the vendored FreeLLMAPI
npm --workspace @strix/desktop run start
```
Then open `http://localhost:3001` → **Keys** → paste a free provider key (Groq /
Gemini / OpenRouter) so the AI panel can answer. Everything else works without it.

---

*Questions to send back: which of the §8 items would you prioritise? Anything in
§6 you'd have decided differently? Any "table-stakes" IDE feature we're missing?*
