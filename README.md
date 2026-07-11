<div align="center">

# Strix

**An AI-native desktop IDE.** A lightweight, modern editor your team owns end-to-end —
with the AI assistant, coding agents, and a local-first model stack baked in, not bolted on.

Electron · React 19 · TypeScript (strict) · Monaco · xterm.js · Rust-free, native-module-light

</div>

---

## What it is

Strix is a custom desktop IDE (the repo folder is still `tabea` from an earlier name; the
product is **Strix** — a genus of owl). It aims for four things, in order:

1. **Lightweight** — fast, low RAM/CPU.
2. **Simple but modern** — the daily essentials of a VS Code-class editor, with its own look.
3. **AI-native** — AI help (chat, agents, run-and-fix) is part of the editing loop.
4. **Safe by default** — no secrets in the bundle, CSP without `unsafe-eval`, sandboxed IPC.

It is **not** a VS Code extension-marketplace clone — that's a deliberate security choice.

## Editions

Strix ships as **two build-time editions from one codebase** (flag: `STRIX_EDITION`):

| | **M1** (free, public) | **M1 Competition** (private) |
|---|---|---|
| FreeLLMAPI AI · FreeBuff agent | ✅ | ✅ |
| Bring-your-own API-key models | ✅ | ✅ |
| Coding agents (monitors/auditors) | ✅ | ✅ |
| Claude Code hand-off | ❌ | ✅ |
| Cybersec mode | ❌ | ✅ |
| **Local-model auto-detect** (Ollama/LM Studio) | ❌ | ✅ |

The flag is a compile-time constant, so Competition-only code is tree-shaken out of the M1 bundle.

## Features

**Editor** — Monaco with ~25-language highlighting, multi-file tabs, split editors, breadcrumbs,
Markdown/HTML preview, inline AI autocomplete, Ctrl+G generate-from-comment, Format Document, and a
large-file guard (minified bundles no longer lock the editor).

**AI Assistant** — chat / explain / fix / refactor / vuln-check with a **model picker**:
FreeLLMAPI **Auto** (free-provider router with failover) plus **your own direct API-key models**
(OpenAI, OpenRouter, Groq, DeepSeek, …) — added via **provider presets** (baseURL/model prefilled)
with a **native Anthropic** adapter — and **auto-detected local models** (Ollama / LM Studio,
Competition). The **active model answering this session is always shown** next to the picker. Agentic
build/edit from chat, diff-proposal apply with **one-click rollback**, **edit / delete previous chat
turns** (revert the thread like VS Code), and a **Run → auto-fix loop**: runs a command, and on
failure (exit code *or* errors in the output) proposes a fix and re-runs — bounded to 3 rounds, and
**stops immediately on environment errors** (missing tool / command not found — no code fix helps).

**Coding agents** — a panel of single-purpose agents that watch the project and **monitor/audit only
(never edit your code)**: README/Progress/Changelog/TODO/Architecture doc-writers, plus Security,
Bug, Test-gap, Cleanup, Dependency, **Performance, Accessibility, and Error-handling** auditors. A
**Findings inbox** aggregates their latest reports; each hands off to the **AI Assistant** or
**FreeBuff** to fix. Configurable per project in `.strix/agents.json`.

**FreeBuff** — a free coding-agent CLI, embedded **inside the AI panel** (Strix AI ⇄ FreeBuff
toggle) with a live usage bar (sessions / time left).

**Workbench** — file tree (whole-project, virtualized), workspace-wide search & replace, Source
Control (stage/commit/**Sync**/branch/history/PR, AI commit messages), Problems, Run & Serve with a
local static host + live HTML preview, integrated terminal (PowerShell/CMD/pwsh/Git Bash), command
palette, Quick Open, Zen mode, Project Map (Competition).

**Live web preview** — a **Live Preview** tab that runs your project's dev server
(`npm run dev` / Vite / Next / …), captures its localhost URL, and embeds the
**running app** in an in-IDE mini-browser (Electron `<webview>`) with the dev
server's own **HMR/live-update** — the whole functional site, not just the static
HTML render. Reload · open-in-browser · responsive Desktop/Tablet/Mobile · logs.
Plain HTML/JS sites fall back to the static host and reload on save. Open it from
Run & Serve or the command palette ("Preview: Open Live Preview").

**Live auto-update** — on launch Strix checks an update server; if a newer build
exists a banner offers it (**Update now** → download + **sha256-verify** →
**Restart to apply**). Updates install **silently** (per-user, no UAC) and
relaunch. Publish a release with `npm run update:publish`; serve it locally with
`npm run update:serve` (Phase 1) or from any https host (Phase 2). Help → *Check
for Updates…* checks on demand.

**Multi-window** — open several windows, **one project per window** (own watcher, LSP, search).

**Themes** — clean dark (violet accent) + **Black (OLED)**, midnight, high-contrast, light; accents
gold/violet/teal/emerald/blue/red/white/black; opt-in Liquid Glass.

**GitHub** — clone-a-repo picker, browser "Sign in with GitHub" (OAuth Device Flow), Sync/publish.

## Install

Prebuilt Windows installers are produced by `npm run package:m1` / `package:competition` (custom
**Inno Setup** installer). At startup it offers **"install for all users vs just me"**: *just me*
(default) installs per-user under `%LOCALAPPDATA%\Programs` with no UAC — so live auto-update applies
silently; *all users* installs into Program Files (UAC) and self-updates with one UAC prompt per
update. Opt-in desktop shortcut / add-to-PATH / "Open with Strix" either way. The apps are **not code-signed** yet, so Windows SmartScreen shows an "unknown publisher"
warning — click **More info → Run anyway** (see [PROGRESS.md](PROGRESS.md) for the code-signing plan).

## Develop

```powershell
git clone https://github.com/BackgroundCharacter101/strix
cd strix
npm install
npm run ai:setup                       # install + build the vendored FreeLLMAPI

npm --workspace @strix/desktop run start   # build + launch (auto-starts FreeLLMAPI on :3001)
```

**Live-reload dev loop** — while developing, skip the installer entirely:

```powershell
npm run dev:app                 # (or dev:app:competition)
```

One command runs FreeLLMAPI (:3001, kept alive across restarts), the Vite dev
server (:3000), and Electron. **Renderer edits hot-reload instantly** (Vite HMR);
saving any `main/*.ts` rebuilds and **relaunches just the window** in ~0.3 s. No
rebuild, no reinstall. Ctrl+C (or closing the window) tears the whole loop down.

For AI answers, add a provider key once — Settings → AI → provider keys (Groq / Gemini / OpenRouter
are free), **or** add a direct API-key model, **or** (Competition) run Ollama and click *Detect
local models*.

**Edition-specific:** `npm run start:m1` · `npm run start:competition` · `package:m1` · `package:competition`.

## Quality gates

```powershell
npm run typecheck    # tsc --build (strict)
npm run lint         # eslint (flat) + typescript-eslint
npm test             # vitest — 420 tests / 61 files
npm run security     # secret / forbidden-file scan (pre-commit hook + CI)
```

Current: typecheck + lint clean · **420 tests** pass · **0 prod vulns** · both editions build.

## Repo layout

```
apps/desktop/        Electron app — main/ (Node) + renderer/ (React)
packages/            @strix/ai-gateway, editor (Monaco), terminal, lsp, collab, ui
freellmapi/          vendored FreeLLMAPI (self-hosted OpenAI-compatible router)
docs/                setup / packaging / deployment notes
ARCHITECTURE.md      design source of truth
PROGRESS.md          living status + handoff (read this when resuming work)
```

## Docs

- **[PROGRESS.md](PROGRESS.md)** — living status, feature inventory, gotchas, next steps.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — design spec.
- **[OVERVIEW.md](OVERVIEW.md)** — project snapshot for reviewers.
- **[docs/](docs/)** — setup, packaging, team/homelab deploy.

## Status

Active development on branch `feat/editions-m1` (269 commits). Test build — shipping to the team;
open items are choices, not blockers: code signing (paid cert), the GitHub OAuth client ID
(one-time), hosting the update feed on a real https host, and first-run onboarding. A **Tauri/Rust
rewrite (Strix 2.0)** is scoped
for after the competition build ships.
