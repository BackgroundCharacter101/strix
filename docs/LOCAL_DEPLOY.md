# Local FreeLLMAPI Deployment (no Pi)

Run the AI backbone on your own machine instead of the Raspberry Pi. The
service is vendored as the `freellmapi/` git submodule.

## One-time setup (already done in this repo)

```bash
git submodule update --init        # populate freellmapi/ on a fresh clone
cd freellmapi
npm install
cp .env.example .env               # then put a 64-char hex ENCRYPTION_KEY in it:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run build
```

A SQLite DB and your **unified API key** are created on first run and printed
to the console (`freellmapi-…`). That key is already recorded in this repo's
root `.env` (gitignored).

## Run it

```bash
cd freellmapi
node server/dist/index.js          # API + dashboard on http://localhost:3001
# or, for hot-reload dev:  npm run dev   (API :3001, dashboard :5173)
```

## Add provider keys (required before the AI answers)

1. Open **http://localhost:3001** → **Keys** page.
2. Add at least one free-tier provider key (Google Gemini, Groq, Cerebras,
   Mistral, OpenRouter, …). With **zero** keys, `/v1/chat/completions` has
   nothing to route to and will fail.
3. Reorder the **Fallback Chain** if you like.
4. The **unified key** shown in the Keys header is what Strix authenticates
   with (kept in the repo-root `.env` as `FREELLMAPI_KEY`).

## Verify

```bash
curl http://localhost:3001/v1/models          # lists the router + models
```

## Connecting Strix

Strix's renderer talks to `FREELLMAPI_URL` (`http://localhost:3001/v1`). See
the note in the project README about wiring `FREELLMAPI_KEY` into the renderer
bundle — the value lives in the root `.env`.
