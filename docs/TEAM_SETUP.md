# Team setup — one shared AI host + Strix.exe on each machine

The efficient model for a team: **run FreeLLMAPI once on a single host machine**,
and every teammate's **Strix.exe** points at it. No per-machine AI server, no
bundling, no writable-DB headaches — just the IDE on each desktop and one shared
AI backbone.

```
        ┌─────────────────────────┐
        │  Host machine / server  │
        │  FreeLLMAPI  :3001       │  ← provider keys live here, once
        └───────────▲─────────────┘
                    │  LAN (http://<host-ip>:3001)
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
   Strix.exe     Strix.exe     Strix.exe      ← teammates, just the IDE
```

## 1. On the host machine (one-time)

```powershell
git clone https://github.com/BackgroundCharacter101/strix.git
cd strix
npm install
npm run ai:setup          # install + build FreeLLMAPI, generate its key
$env:HOST = "0.0.0.0"     # bind all interfaces so teammates can reach it
npm run ai:start          # start the server on :3001
```

> The server binds **localhost only by default** (so a per-machine install isn't
> exposed to the network). Setting `HOST=0.0.0.0` is what makes it reachable from
> other machines — only do this on the intended team host.

Then:
- Open `http://localhost:3001` → **Keys** → paste your free provider keys
  (Groq / Gemini / OpenRouter / …). This is done **once, here** — teammates
  don't need their own keys.
- Make sure the server is reachable on the LAN:
  - Find the host IP: `ipconfig` → IPv4 Address (e.g. `192.168.1.50`).
  - Allow **inbound TCP 3001** through Windows Firewall.
  - With `HOST=0.0.0.0` set (above), `http://<host-ip>:3001` works from other
    machines. Test from a teammate's browser: `http://192.168.1.50:3001`.
- To keep it running, leave the terminal open, run it as a service, or use a
  process manager (pm2, nssm, a scheduled task).

## 2. On each teammate's machine

1. Install Strix (the `.exe` — see `docs/PACKAGING.md` to build it), or run from
   source. **No `ai:setup` needed** — the IDE is AI-server-free.
2. In Strix: **Settings** (gear / `Ctrl+,`) → **AI → AI server URL** →
   enter the host, e.g. `http://192.168.1.50:3001`.
3. That's it — the AI panel now uses the shared host. The model dropdown fills
   from the host's configured providers.

## How it works under the hood

- The AI server URL is a **setting** (`aiServerUrl`, persisted per machine).
  `window.strix.ai.config(url)` / `models(url)` in main fetch the key + model
  list from that host (falling back to a local server when the field is blank).
- The renderer's **Content-Security-Policy** allows `http://*:3001` /
  `https://*:3001`, so any LAN host on port 3001 is reachable while still
  blocking everything else.
- The packaged Strix.exe **does not bundle or auto-start** a FreeLLMAPI server.

## Notes / options

- **Different port?** The CSP currently allows port **3001** on any host. If you
  host on another port, widen the `connect-src` in `renderer/index.html`.
- **HTTPS / hostname** (e.g. behind a reverse proxy) also works —
  `https://*:3001` is allowed; use a hostname like `http://strix-ai.local:3001`.
- **Off the LAN?** Put the host behind a VPN (e.g. Tailscale) and use its private
  IP — no public exposure of the AI server.
- A teammate can still run a **local** server (blank URL) if they want to work
  offline.
