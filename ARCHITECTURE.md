# ARCHITECTURE.md

> **Project:** Custom IDE (Zed-inspired)
> **AI Backbone:** FreeLLMAPI — self-hosted, 14 providers, ~800M tokens/month free
> **Team deployment:** Raspberry Pi 5 homelab server
> **Stack:** Electron · React · TypeScript · Monaco Editor · Node.js · Yjs

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [System Architecture](#3-system-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Monorepo Structure](#5-monorepo-structure)
6. [Component Breakdown](#6-component-breakdown)
   - 6.1 [Editor Layer](#61-editor-layer)
   - 6.2 [AI Gateway Package](#62-ai-gateway-package)
   - 6.3 [FreeLLMAPI Service](#63-freellmapi-service)
   - 6.4 [Terminal Package](#64-terminal-package)
   - 6.5 [LSP Package](#65-lsp-package)
   - 6.6 [Collab Package](#66-collab-package)
   - 6.7 [Electron Shell](#67-electron-shell)
7. [AI Provider Pool](#7-ai-provider-pool)
8. [AI Features Specification](#8-ai-features-specification)
9. [Team Homelab Deployment](#9-team-homelab-deployment)
10. [Build Phases & Timeline](#10-build-phases--timeline)
11. [Data Flow Diagrams](#11-data-flow-diagrams)
12. [Security & Key Management](#12-security--key-management)
13. [Team Ground Rules](#13-team-ground-rules)
14. [Future Roadmap](#14-future-roadmap)

---

## 1. Project Overview

This is a **team-built, Zed-inspired desktop IDE** designed for developers and cybersecurity practitioners. The IDE integrates a multi-provider AI assistant powered by **FreeLLMAPI** — an open-source, OpenAI-compatible proxy that aggregates the free tiers of 14 AI providers into a single endpoint with automatic failover, rate-limit tracking, and encrypted key storage.

The IDE runs as an **Electron desktop application** (Windows, Linux, macOS) and communicates with a **shared FreeLLMAPI instance** running on the team's Raspberry Pi 5 homelab server, pooling ~800 million free tokens per month across the entire team.

### Why build this?

- Full control over editor behaviour, keybindings, and UI
- AI features that don't cost a cent — pooled free tiers from 14 providers
- Custom cybersecurity-focused tooling baked in (hex viewer, CTF workspace, vulnerability linter)
- Real-time collaborative editing across the team
- No vendor lock-in on any single AI provider

---

## 2. Goals & Non-Goals

### Goals

- [x] Electron desktop IDE that feels fast and native
- [x] Monaco Editor core with syntax highlighting for Python, JS/TS, C, Bash, and more
- [x] Self-hosted AI assistant via FreeLLMAPI (no paid API required for daily use)
- [x] Inline autocomplete, AI chat sidebar, explain/fix/generate AI features
- [x] Integrated terminal (xterm.js)
- [x] LSP support for Python and JavaScript/TypeScript
- [x] Real-time collaborative editing (Yjs CRDTs)
- [x] Cybersecurity-specific panels (hex viewer, CTF templates, vuln linter)
- [x] Cross-platform installer (Windows + Linux primarily)
- [x] Shared FreeLLMAPI server on Raspberry Pi 5 for team token pooling

### Non-Goals (for now)

- [ ] Cloud-hosted SaaS version (local/LAN first)
- [ ] Mobile or browser-only version
- [ ] Plugin/extension marketplace (internal use only)
- [ ] Paid API tier management or billing
- [ ] Support for GPT-5 / Claude Opus class frontier models (free tiers only)

---

## 3. System Architecture

### High-Level Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    TEAM DEVELOPER MACHINE                      │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   YOUR IDE (Electron)                    │  │
│  │                                                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │   Monaco    │  │  File Tree  │  │   Tab Manager   │  │  │
│  │  │   Editor    │  │  + Explorer │  │   + Splits      │  │  │
│  │  └──────┬──────┘  └─────────────┘  └─────────────────┘  │  │
│  │         │                                                 │  │
│  │  ┌──────▼──────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │  AI Chat    │  │  Integrated │  │   Hex Viewer /  │  │  │
│  │  │  Sidebar    │  │  Terminal   │  │   CTF Workspace  │  │  │
│  │  └──────┬──────┘  └─────────────┘  └─────────────────┘  │  │
│  │         │                                                 │  │
│  │  ┌──────▼──────────────────────────────────────────────┐ │  │
│  │  │            packages/ai-gateway                      │ │  │
│  │  │   OpenAI SDK → baseURL: http://PI_IP:3001/v1        │ │  │
│  │  └──────────────────────────┬──────────────────────────┘ │  │
│  └────────────────────────────│─────────────────────────────┘  │
└───────────────────────────────│────────────────────────────────┘
                                │  Local Network (LAN only)
                                │  HTTP + WebSocket
┌───────────────────────────────▼────────────────────────────────┐
│                    RASPBERRY PI 5 (homelab)                     │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   FreeLLMAPI :3001                       │  │
│  │                                                          │  │
│  │  ┌────────────┐  ┌───────────────┐  ┌────────────────┐  │  │
│  │  │   Router   │  │  Rate-limit   │  │  Health check  │  │  │
│  │  │  (model    │  │  ledger       │  │  service       │  │  │
│  │  │  selector) │  │  (SQLite)     │  │  (per key)     │  │  │
│  │  └────────────┘  └───────────────┘  └────────────────┘  │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Provider adapters (one per provider)              │  │  │
│  │  │  google · groq · cerebras · mistral · openrouter  │  │  │
│  │  │  github · huggingface · nvidia · cloudflare · ... │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  nginx (reverse proxy)  ·  PM2 (process manager)               │
│  OpenMediaVault (NAS)   ·  pfSense firewall (WAN block)        │
└────────────────────────────────────────────────────────────────┘
                                │
          ┌──────┬──────┬───────┼──────┬────────┬────────┐
          ▼      ▼      ▼       ▼      ▼        ▼        ▼
       Google  Groq  Cerebras Mistral OpenRouter  HF   +8 more
       Gemini  LPU   Llama   Codestral free-tier       providers
```

### Request Flow (simplified)

```
IDE AI feature triggered
        │
        ▼
packages/ai-gateway builds prompt + context
        │
        ▼
OpenAI SDK POST /v1/chat/completions → FreeLLMAPI :3001
        │
        ▼
FreeLLMAPI Router:
  1. Pick highest-priority model with a healthy key under rate limits
  2. Decrypt API key (AES-256-GCM)
  3. Call provider adapter
  4. On 429 / 5xx → cooldown + retry next model in chain (up to 20 attempts)
        │
        ▼
Streamed tokens back to IDE
Response header: X-Routed-Via: groq/llama-3.3-70b
        │
        ▼
IDE renders streamed text in chat panel / inline completion
Status bar updates: "AI: groq/llama-3.3-70b · 4,210 tokens today"
```

---

## 4. Tech Stack

### Desktop Application

| Layer | Technology | Purpose |
|---|---|---|
| Shell | **Electron 32** | Cross-platform desktop wrapper |
| UI framework | **React 19** | Component-based UI |
| Language | **TypeScript 5** | Type safety across the entire codebase |
| Build tool | **Vite 6** | Fast dev server and bundler for renderer |
| Styling | **Tailwind CSS 4** | Utility-first styling |

### Editor Core

| Layer | Technology | Purpose |
|---|---|---|
| Editor engine | **Monaco Editor** | VS Code's editor engine, runs in browser/Electron |
| Terminal | **xterm.js** | Full terminal emulator in the UI |
| LSP bridge | **monaco-languageclient** | Connects Monaco to language servers |
| File system | **Node.js `fs` API** | Direct file read/write via Electron main process |

### AI Layer

| Layer | Technology | Purpose |
|---|---|---|
| AI proxy | **FreeLLMAPI** (self-hosted) | Routes across 14 free AI providers |
| AI client | **OpenAI SDK** (`openai` npm) | Calls FreeLLMAPI's OpenAI-compatible endpoint |
| Rate state | **SQLite** (inside FreeLLMAPI) | Persists per-key rate limit counters |

### Backend & Collaboration

| Layer | Technology | Purpose |
|---|---|---|
| Backend | **Node.js 22 + Express** | Electron main process + FreeLLMAPI server |
| Real-time collab | **Yjs** | CRDT-based conflict-free collaborative editing |
| Collab transport | **y-websocket** | WebSocket server for Yjs sync |
| Git | **isomorphic-git** | Git operations from within the IDE |

### Monorepo & Tooling

| Tool | Purpose |
|---|---|
| **Turborepo** | Monorepo build orchestration, caching |
| **npm workspaces** | Package linking |
| **Vitest** | Unit + integration testing |
| **ESLint + Prettier** | Lint and format |
| **electron-builder** | Package and distribute the app |
| **GitHub Actions** | CI — manifest/security/lint/typecheck/test + build smoke on every PR; tag-triggered Release builds the Windows M1 installer + Linux AppImage |

---

## 5. Monorepo Structure

```
strix/
│
├── apps/
│   └── desktop/                    ← Electron application
│       ├── main/                   ← Node.js main process
│       │   ├── index.ts            ← App entry, BrowserWindow setup
│       │   ├── ipc/                ← IPC handlers (file, terminal, git)
│       │   └── preload.ts          ← Context bridge API
│       └── renderer/               ← React renderer process
│           ├── App.tsx             ← Root component, layout
│           ├── panels/             ← Editor, Terminal, AI sidebar panels
│           ├── components/         ← Shared UI components
│           └── hooks/              ← useAI, useEditor, useFile hooks
│
├── packages/
│   ├── editor/                     ← Monaco wrapper
│   │   ├── Editor.tsx              ← Monaco React component
│   │   ├── themes/                 ← Custom dark/light themes
│   │   ├── languages/              ← Custom language grammars
│   │   └── keybindings.ts          ← Keyboard shortcut map
│   │
│   ├── ai-gateway/                 ← AI client (talks to FreeLLMAPI)
│   │   ├── client.ts               ← OpenAI SDK configured for FreeLLMAPI
│   │   ├── tasks.ts                ← Task types: autocomplete, chat, explain, fix
│   │   ├── context.ts              ← Build prompts with file/selection context
│   │   ├── stream.ts               ← Stream helper (token-by-token rendering)
│   │   └── status.ts               ← Parse X-Routed-Via, track today's usage
│   │
│   ├── terminal/                   ← xterm.js integration
│   │   ├── Terminal.tsx            ← Terminal React component
│   │   ├── pty.ts                  ← node-pty wrapper (main process)
│   │   └── profiles.ts             ← Shell profiles (bash, zsh, pwsh)
│   │
│   ├── lsp/                        ← Language server bridge
│   │   ├── manager.ts              ← Start/stop LSP processes
│   │   ├── python.ts               ← pylsp adapter
│   │   ├── typescript.ts           ← typescript-language-server adapter
│   │   └── bridge.ts               ← Monaco ↔ LSP message routing
│   │
│   ├── collab/                     ← Real-time collaboration
│   │   ├── provider.ts             ← Yjs WebSocket provider
│   │   ├── awareness.ts            ← Cursor presence (names, colours)
│   │   └── server.ts               ← y-websocket server (runs on Pi 5)
│   │
│   └── ui/                         ← Shared React components
│       ├── Sidebar.tsx
│       ├── Statusbar.tsx
│       ├── Tabs.tsx
│       └── FileTree.tsx
│
├── freellmapi/                     ← Git submodule
│   └── ...                         ← FreeLLMAPI source (runs on Pi 5)
│
├── docs/
│   ├── SETUP.md                    ← Dev environment setup guide
│   └── HOMELAB.md                  ← Pi 5 deployment guide
│
├── .github/
│   ├── agents/                     ← strix-* agent workflow definitions
│   └── workflows/
│       ├── ci.yml                  ← Lint + test on every PR
│       └── release.yml             ← Build installer on version tag
│
├── ARCHITECTURE.md                 ← This file (source of truth, repo root)
├── AGENTS.md                       ← Agent workflow registry
├── turbo.json                      ← Turborepo pipeline config
├── package.json                    ← Root workspace
└── .env.example                    ← FREELLMAPI_URL, COLLAB_SERVER_URL
```

---

## 6. Component Breakdown

### 6.1 Editor Layer

**Package:** `packages/editor`

The editor layer wraps **Monaco Editor** — the same engine that powers VS Code. It runs in Electron's renderer process inside a React component.

**Responsibilities:**
- Render the code editor with correct language mode per file extension
- Apply custom themes (dark cyberpunk-style default, light optional)
- Expose selection, cursor position, and current file content to other packages
- Trigger AI autocomplete on typing pause (~400ms debounce)
- Apply inline diff view when AI suggests a refactor

**Key APIs exposed:**
```typescript
editor.getValue(): string           // full file content
editor.getSelection(): string       // currently selected text
editor.applyEdit(edit: TextEdit)    // apply an AI-suggested patch
editor.onDidChangeContent(cb)       // subscribe to content changes
```

---

### 6.2 AI Gateway Package

**Package:** `packages/ai-gateway`

This is the single point of contact between the IDE and the AI. It wraps the **OpenAI SDK** configured to call your FreeLLMAPI instance, and adds IDE-specific logic: prompt building, task routing, streaming, and status tracking.

**`client.ts` — OpenAI SDK setup:**
```typescript
import OpenAI from 'openai';

// AI calls run directly from the Electron renderer (see §6.7), where `process`
// may be undefined and the OpenAI SDK requires an explicit browser opt-in.
const env: Record<string, string | undefined> =
  typeof process !== 'undefined' ? process.env : {};

export const ai = new OpenAI({
  baseURL: env.FREELLMAPI_URL ?? 'http://localhost:3001/v1',
  apiKey: env.FREELLMAPI_KEY ?? 'freellmapi-your-unified-key',
  dangerouslyAllowBrowser: true,
});
```

**`tasks.ts` — Task type to model preference mapping:**
```typescript
export const TASK_MODEL_PREFERENCE: Record<TaskType, string> = {
  autocomplete: 'auto',   // FreeLLMAPI picks fastest (Groq priority)
  chat:         'auto',   // sticky session, best available
  explain:      'auto',   // prefers quality (Gemini 2.5 Flash)
  fix:          'auto',
  generate:     'auto',
  refactor:     'auto',
  vuln_check:   'auto',
};
```

**`context.ts` — Prompt building:**
```typescript
export function buildPrompt(task: TaskType, opts: {
  fileContent: string;
  filePath: string;
  selection?: string;
  errorMessage?: string;
  userMessage?: string;
}): ChatMessage[]
```

**`stream.ts` — Streaming token renderer:**
```typescript
export async function streamToPanel(
  stream: AsyncIterable<ChatCompletionChunk>,
  onToken: (token: string) => void,
  onDone: (routedVia: string) => void,
): Promise<void>
```

**`status.ts` — Status bar integration:**

Parses the `X-Routed-Via` response header on every request and maintains a running token count for the day's session. Emits events that the status bar subscribes to.

---

### 6.3 FreeLLMAPI Service

**Source:** `freellmapi/` (git submodule from `github.com/tashfeenahmed/freellmapi`)

**What it is:** A self-hosted Express server that exposes a single OpenAI-compatible endpoint (`POST /v1/chat/completions`) and routes every request across whichever of the 14 configured providers is currently healthy and under its rate limits.

**Internal architecture (from the FreeLLMAPI repo):**

| File | Role |
|---|---|
| `server/src/services/router.ts` | Picks the best model per request |
| `server/src/services/ratelimit.ts` | RPM / RPD / TPM / TPD counters in SQLite, cooldowns on 429s |
| `server/src/providers/*.ts` | One adapter per provider, each implements `chatCompletion()` and `streamChatCompletion()` |
| `server/src/services/health.ts` | Periodic health probes, marks keys as healthy / rate_limited / invalid |
| `client/` | React + Vite admin dashboard (Keys, Fallback Chain, Analytics, Playground) |

**Fallback chain logic:**
```
Request arrives
  → Router checks priority list (configurable in dashboard)
  → Picks first model where: key is healthy AND all counters under cap
  → On 429 / 5xx / timeout: put key on cooldown, retry next model
  → Up to 20 retry attempts across providers
  → Response header: X-Routed-Via: <platform>/<model>
                     X-Fallback-Attempts: N
```

**Sticky sessions:**
Multi-turn chat conversations are pinned to the same model for 30 minutes. This prevents the hallucination spikes that occur when a mid-conversation model switch causes the new model to lose context coherence.

---

### 6.4 Terminal Package

**Package:** `packages/terminal`

Integrates **xterm.js** in the renderer and **node-pty** in the main process for a full pseudo-terminal experience.

**Architecture:**
```
Renderer: <Terminal /> component (xterm.js)
    │  IPC bridge (Electron contextBridge)
    ▼
Main process: node-pty spawns shell (bash / zsh / PowerShell)
    │
    ▼
Real shell process — full PTY, colours, interactive programs
```

**Features:**
- Multiple terminal tabs
- Split terminal panes
- Shell profile selector (bash, zsh, PowerShell)
- Persistent history across sessions
- Click-to-open file paths from terminal output

---

### 6.5 LSP Package

**Package:** `packages/lsp`

Bridges **Monaco Editor** with language servers running as child processes in the main process.

**Supported language servers (Phase 5):**

| Language | Server | Install |
|---|---|---|
| Python | `pylsp` | `pip install python-lsp-server` |
| JavaScript / TypeScript | `typescript-language-server` | `npm i -g typescript-language-server` |
| C / C++ | `clangd` | System package (`apt install clangd`) |
| Bash | `bash-language-server` | `npm i -g bash-language-server` |

**Features provided:**
- Inline error and warning squiggles
- Hover documentation
- Go to definition / go to references
- Auto-import suggestions
- Code actions (quick fixes)

---

### 6.6 Collab Package

**Package:** `packages/collab`

Real-time collaborative editing using **Yjs** — a CRDT (Conflict-free Replicated Data Type) library that lets multiple editors modify the same document simultaneously with automatic conflict resolution, no server authority needed.

**Architecture:**
```
Dev A IDE                           Dev B IDE
  │                                   │
  │  Yjs doc (local)                  │  Yjs doc (local)
  │                                   │
  └──────────────┬────────────────────┘
                 │  WebSocket
                 ▼
         y-websocket server
         (runs on Pi 5 :1234)
         Broadcasts Yjs updates
         between all connected clients
```

**Features:**
- Shared cursor presence (see teammates' cursors with their name and colour)
- Full document sync on connect
- Offline-safe — edits queue and sync when reconnected
- Per-file awareness — see who has which file open

---

### 6.7 Electron Shell

**Package:** `apps/desktop`

The Electron shell glues everything together into a distributable desktop application.

**Main process responsibilities:**
- Create and manage `BrowserWindow`
- Expose IPC handlers for: file system operations, terminal PTY, LSP process management, git operations
- Handle app lifecycle (tray, auto-updater, crash reporter)

**Renderer process:**
- React 19 app with the full IDE UI
- Communicates with main process via `contextBridge` preload API
- All AI calls go out directly from renderer via `packages/ai-gateway` (no main process needed for HTTP)

**IPC channel map:**

| Channel | Direction | Purpose |
|---|---|---|
| `file:read` | renderer → main | Read file contents from disk |
| `file:write` | renderer → main | Write file contents to disk |
| `file:tree` | renderer → main | Get directory tree |
| `terminal:create` | renderer → main | Spawn PTY process |
| `terminal:data` | bidirectional | Stream terminal I/O |
| `lsp:start` | renderer → main | Start language server |
| `lsp:message` | bidirectional | LSP JSON-RPC messages |
| `git:status` | renderer → main | Git status for current repo |

---

## 7. AI Provider Pool

All providers are managed by FreeLLMAPI. The IDE only knows about one endpoint.

| Provider | Model | Speed | Free Daily Limit | Tokens/Month | ToS Status |
|---|---|---|---|---|---|
| **Google Gemini** | 2.5 Pro / Flash | Fast | 1,500 req/day | 250K TPM | ✅ OK |
| **Groq** | Llama 3.3 70B | 🚀 Ultra-fast (300–1000 TPS) | 1,000 req/day | 6K TPM | ✅ OK |
| **Cerebras** | Llama 3.3 70B | 🚀 Ultra-fast | 1,000 req/day | 1M tokens/day | ✅ OK |
| **Mistral** | Large + Codestral | Medium | No daily cap | 1B/month | ✅ OK |
| **OpenRouter** | 30+ free models | Varies | No hard cap | Model-dependent | ✅ Private use |
| **GitHub Models** | GPT-4o, Llama, Phi | Medium | Rate limited | Experimentation | ⚠️ Caution |
| **Hugging Face** | 1000s of OSS | Slow (cold starts) | Rate limited | Broad catalog | ✅ OK |
| **NVIDIA NIM** | NIM catalog | Fast | Rate limited | Eval only | ⚠️ Eval only |
| **Cloudflare AI** | Workers AI models | Fast CDN | Rate limited | — | ⚠️ Ambiguous |
| **SambaNova** | Llama 3.3 70B | Fast | Rate limited | — | ⚠️ Ambiguous |
| **Zhipu** | GLM-4 series | Medium | Rate limited | Non-commercial | ✅ Research OK |
| **Moonshot / Kimi** | Kimi models | Medium | Rate limited | Personal use | ✅ Likely OK |
| **MiniMax** | abab / hailuo | Medium | Rate limited | — | ⚠️ ToS unclear |
| **Cohere** | Command R+ | Medium | Trial only | Trial | ❌ ToS forbids |

**Recommended fallback chain priority (configure in FreeLLMAPI dashboard):**
```
1. Gemini 2.5 Flash    (quality + generous daily limit)
2. Groq Llama 3.3 70B  (speed for autocomplete)
3. Cerebras Llama 70B  (best daily volume)
4. Mistral Codestral   (code-specialized)
5. OpenRouter auto     (variety fallback)
6. Hugging Face        (last resort, may be slow)
```

> **Token budget reality check:** The team's combined usage is pooled. Groq and Gemini Pro have the lowest daily caps — they will be exhausted first on heavy usage days. The router will fall to Cerebras (1M tokens/day) and Mistral (1B/month) as the day progresses. Everything resets at UTC midnight.

---

## 8. AI Features Specification

### 8.1 Inline Autocomplete

- **Trigger:** 400ms pause after typing (debounced)
- **Context sent:** 50 lines above cursor + file path + language
- **Model preference:** Groq (lowest latency — sub-200ms)
- **Render:** Ghost text inline, `Tab` to accept, `Esc` to dismiss
- **Max tokens:** 150 (keep completions short and fast)

### 8.2 AI Chat Sidebar

- **Trigger:** Panel toggle (`Ctrl+L` or sidebar icon)
- **Context sent:** Current file content + selection (if any) + conversation history
- **Model preference:** FreeLLMAPI auto (sticky session — same model for 30 min)
- **Render:** Chat bubble UI with streaming token display
- **Multi-turn:** Full conversation history sent on every message

### 8.3 Explain Selected Code

- **Trigger:** Select code → right-click → "Explain with AI" (or `Ctrl+Shift+E`)
- **Context sent:** Selected block + surrounding 10 lines for context + language
- **Model preference:** Gemini 2.5 Flash (quality reasoning)
- **Render:** Opens inline panel below selection with explanation

### 8.4 Fix Error

- **Trigger:** Click on red squiggle → "Fix with AI" code action
- **Context sent:** Error message from LSP + surrounding 20 lines
- **Model preference:** FreeLLMAPI auto
- **Render:** Diff view — shows original vs suggested fix, apply with one click

### 8.5 Generate from Comment

- **Trigger:** Write `# generate: <description>` on a line → `Ctrl+G`
- **Context sent:** Comment text + file context + language
- **Model preference:** Mistral Codestral (code-specialized)
- **Render:** Generated code inserted below the comment line

### 8.6 Refactor Assistant

- **Trigger:** Select function → right-click → "Refactor with AI"
- **Context sent:** Selected function + surrounding class/module context
- **Model preference:** Gemini 2.5 Flash
- **Render:** Side-by-side diff panel, accept or dismiss

### 8.7 Vulnerability Explainer (cybersec feature)

- **Trigger:** Select code → right-click → "Check security"
- **Context sent:** Selected block + language + system prompt instructing security analysis
- **Model preference:** FreeLLMAPI auto
- **Render:** Panel showing risk level, vulnerability class (e.g. SQL injection, buffer overflow), and suggested fix

### 8.8 Status Bar Integration

Every AI response updates the bottom status bar with:
```
AI: groq/llama-3.3-70b  ·  ↓ 4,210 tokens today  ·  2 fallbacks
```
- Parsed from `X-Routed-Via` and `X-Fallback-Attempts` response headers
- Token count resets at UTC midnight (matches FreeLLMAPI's daily quota reset)

---

## 9. Team Homelab Deployment

### Infrastructure Overview

```
Raspberry Pi 5 (homelab server)
├── FreeLLMAPI          → :3001  (AI proxy — primary service)
├── y-websocket server  → :1234  (Yjs collab sync)
├── nginx               → :80    (reverse proxy for both)
└── OpenMediaVault      → :8080  (NAS management UI)

pfSense (secondary laptop)
└── Firewall rule: block WAN → Pi port 3001 (LAN only)
```

### FreeLLMAPI Pi 5 Setup

```bash
# 1. Clone and install
git clone https://github.com/tashfeenahmed/freellmapi.git
cd freellmapi
npm install

# 2. Generate encryption key for API key storage
cp .env.example .env
echo "ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env

# 3. Build for production
npm run build

# 4. Start with PM2 (auto-restart on crash + reboot)
npm install -g pm2
pm2 start "node server/dist/index.js" --name freellmapi
pm2 startup   # generate startup script
pm2 save      # persist process list

# 5. Verify
curl http://localhost:3001/v1/models
```

### nginx Configuration

```nginx
server {
    listen 80;
    server_name pi.local;

    location /ai/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;             # required for SSE streaming
        proxy_cache off;
    }

    location /collab/ {
        proxy_pass http://localhost:1234/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Environment Variables (all team IDEs)

```env
# .env on each developer's machine
FREELLMAPI_URL=http://192.168.x.x:3001/v1
FREELLMAPI_KEY=freellmapi-your-unified-key-from-dashboard
COLLAB_SERVER_URL=ws://192.168.x.x:1234
```

### Monitoring

- FreeLLMAPI Analytics dashboard at `http://pi.local/ai/` shows per-provider token usage, success rates, and latency over 24h / 7d / 30d
- `pm2 logs freellmapi` for live log tail
- `pm2 monit` for CPU / memory

---

## 10. Build Phases & Timeline

| Phase | What gets built | Est. Duration | Milestone |
|---|---|---|---|
| **1** | Turborepo monorepo, tooling, CI/CD, folder structure | 3–4 days | Repo ready, all packages scaffold |
| **2** | Monaco editor shell, file tree, tabs, open/save, syntax highlighting | 1–2 weeks | Can open and edit files |
| **3** | FreeLLMAPI clone + configure + all API keys added + Pi 5 deploy | 3–5 days | AI endpoint live, curl test passes |
| **4** | AI gateway package, chat sidebar, autocomplete, explain, fix | 1–2 weeks | All AI features working in editor |
| **5** | xterm.js terminal, node-pty, Python LSP, TS LSP | 1–2 weeks | Terminal + error squiggles working |
| **6** | Yjs collab, y-websocket server on Pi, presence cursors | 1 week | Two teammates can co-edit live |
| **7** | Hex viewer, CTF workspace templates, vulnerability linter | 1 week | Cybersec features ready |
| **8** | electron-builder packaging, auto-updater, installers, docs | 3–5 days | Installable .exe / .deb / .dmg |

**Total estimated timeline: 10–12 weeks** (for a focused team of 3–4)

### Phase 1 Checklist (start here)

- [ ] Init Turborepo: `npx create-turbo@latest`
- [ ] Create `apps/desktop`, `packages/editor`, `packages/ai-gateway`, `packages/ui`
- [ ] Configure TypeScript project references
- [ ] Add ESLint + Prettier with shared config
- [ ] Set up Vitest with a dummy test in each package
- [x] GitHub Actions CI: gates + build smoke on every PR to `main`; Release on `v*` tag
- [ ] Create `.env.example` with `FREELLMAPI_URL` and `FREELLMAPI_KEY`
- [ ] Write `docs/SETUP.md` — environment setup for new team members
- [ ] Add FreeLLMAPI as a git submodule: `git submodule add https://github.com/tashfeenahmed/freellmapi`

---

## 11. Data Flow Diagrams

### Inline Autocomplete Flow

```
User types code → 400ms debounce fires
        │
        ▼
packages/ai-gateway: context.buildPrompt('autocomplete', { fileContent, filePath })
  → System: "You are a coding assistant. Complete the code."
  → User: "File: main.py\n\n[50 lines above cursor]\n[cursor position]"
        │
        ▼
OpenAI SDK: POST http://PI_IP:3001/v1/chat/completions
  { model: 'auto', stream: true, max_tokens: 150 }
        │
        ▼
FreeLLMAPI router → picks Groq (fastest for autocomplete)
  → Groq LPU inference → 300+ tokens/second
  → Streams back via SSE
        │
        ▼
packages/ai-gateway: stream.ts collects tokens
        │
        ▼
Monaco Editor: renders ghost text inline as tokens arrive
  User presses Tab → text inserted
  User presses Esc → ghost text dismissed
        │
        ▼
Status bar: "AI: groq/llama-3.3-70b"
```

### AI Chat Sidebar Flow

```
User types message in chat sidebar
        │
        ▼
packages/ai-gateway: context.buildPrompt('chat', {
  fileContent, filePath, selection, userMessage,
  history: previousMessages   ← full conversation history included
})
        │
        ▼
POST /v1/chat/completions  { model: 'auto', stream: true }
        │
        ▼
FreeLLMAPI: checks sticky session (same model for 30 min if in conversation)
  → streams response tokens
        │
        ▼
Chat sidebar: renders AI bubble with streaming text
  → "Routed via: gemini/gemini-2.5-flash" shown in bubble footer
```

---

## 12. Security & Key Management

### API Key Security (FreeLLMAPI)

- All 14 provider API keys are stored **encrypted with AES-256-GCM** in SQLite on the Pi 5
- Decryption happens **in-memory only**, just before each outbound request
- The encryption key lives in `.env` on the Pi — never committed to git
- The IDE only ever knows the single `freellmapi-...` unified key, never the upstream provider keys
- The unified key is stored in `.env` on each developer's machine

### Network Security

- FreeLLMAPI is **LAN-only** — pfSense firewall blocks all WAN access to port 3001
- The Pi's admin dashboard (port 5173 in dev, 3001 in prod) should be further restricted to specific team IP addresses via pfSense rules
- All communication between IDE and FreeLLMAPI is over the local network — no data leaves your LAN except the outbound API calls to providers

### What NOT to do

- ❌ Do not expose FreeLLMAPI to the public internet
- ❌ Do not commit `.env` files containing the unified key or encryption key
- ❌ Do not share one provider API key across multiple FreeLLMAPI instances
- ❌ Do not store provider keys anywhere outside FreeLLMAPI's encrypted SQLite

### Terms of Service compliance

- Run **one account per provider, per team member** as backup keys
- Keep usage within personal/non-commercial experimentation — do not build a public product on top of free tiers without switching to paid APIs
- Avoid Cohere — its Trial ToS explicitly forbids personal/household use
- Treat GitHub Models and NVIDIA NIM as supplementary — their free tiers are scoped to experimentation

---

## 13. Team Ground Rules

### Git workflow

- `main` is always deployable — protected branch, requires PR + review
- Feature branches: `feature/phase-2-editor-shell`, `feature/ai-autocomplete`, etc.
- Commit messages: `feat:`, `fix:`, `chore:`, `docs:` prefixes (Conventional Commits)
- Tag each phase milestone: `v0.1.0-phase1`, `v0.2.0-phase2`, etc.

### Code standards

- TypeScript strict mode enabled everywhere — no `any` without a comment explaining why
- Every exported function in `packages/` must have a JSDoc comment
- Every AI feature must have at least one Vitest unit test mocking the FreeLLMAPI response
- No hardcoded API URLs — always read from environment variables

### AI usage discipline

- Monitor the FreeLLMAPI analytics dashboard daily — especially Groq and Gemini daily caps
- Do not run automated scripts or tests against FreeLLMAPI in loops — always mock AI calls in tests
- If a provider's daily cap is exhausted, do not create additional accounts to work around it — wait for midnight UTC reset

### Communication

- Phase kickoffs: short planning session, agree on deliverables before writing code
- Phase completions: demo to the team before merging to `main`
- Architecture changes: update this `ARCHITECTURE.md` file in the same PR as the code change

---

## 14. Future Roadmap

These are out of scope for the initial build but worth planning for:

### Near-term (after Phase 8)

- **Tool / function calling in AI** — FreeLLMAPI does not yet support passing `tools` through to providers. Once added, the AI can directly read files, run terminal commands, and search the codebase
- **Local model fallback** — integrate Ollama with a small local model (e.g. Llama 3.2 3B) for when all API daily limits are exhausted or the team is offline
- **Git integration panel** — visual git diff, staging, commit, push/pull within the IDE
- **Vim keybinding mode** — Monaco supports custom keybinding providers

### Medium-term

- **Extension / plugin system** — allow team members to add custom panels, commands, and language support without modifying the core
- **Notebook mode** — Jupyter-style executable code cells for cybersecurity research and CTF writeups
- **Snippet library** — shared team snippet database synced via Pi 5

### Long-term

- **Browser version** — replace Electron with a web server + browser client for access from any machine
- **Paid API fallback** — when free tiers are exhausted, optionally fall through to a paid provider with budget limits
- **AI agent mode** — multi-step AI that can read files, search the codebase, run tests, and propose multi-file changes autonomously

---

*Last updated: May 2026*
*Maintained by: the IDE team*
*FreeLLMAPI source: https://github.com/tashfeenahmed/freellmapi (MIT License)*