# strix-security-auditor

**Role**: Find and triage security vulnerabilities across the Strix codebase.

| Aspect | Value |
|--------|-------|
| **Trigger** | Every commit (automated gate) + on demand for deep review |
| **Inputs** | Git-tracked source, dependency tree, IPC/bridge surface |
| **Outputs** | Pass/fail gate result; findings (severity, file, fix); `.github/BLOCKERS.md` entry for criticals |
| **Phase** | Any phase (cross-cutting) |
| **Validation** | Hard-fail on leaked secrets / forbidden files / critical dep CVEs |

## Two layers

### 1. Automated gate (deterministic — runs every commit + CI)
- **Secret scan** — `scripts/security-scan.mjs` blocks commits that contain
  private keys, AWS/GitHub/OpenAI/FreeLLMAPI keys, hardcoded credentials, or a
  committed `.env`. Wired via `.githooks/pre-commit` (`npm run security`).
- **Dependency audit** — `npm audit --omit=dev` (critical hard-fails in CI via
  `npm run security:ci`; reported locally).
- Runs in CI on every push/PR (`.github/workflows/ci.yml`).

### 2. Deep semantic review (LLM — on demand)
Run the `/security-review` skill (or invoke this agent) before merging risky
changes. Focus areas for this Electron + Node + AI project:
- **IPC / preload bridge** — every `ipcMain.handle`/`on` is an attack surface;
  validate inputs, never expose arbitrary `fs`/shell to the renderer beyond the
  declared `window.strix` API.
- **Path traversal** — `fs:read`/`fs:write`/`file:tree` must not escape the
  intended workspace.
- **Command injection** — `terminal` (node-pty) and `lsp` (child_process)
  spawn processes; never interpolate untrusted input into a shell.
- **Renderer safety** — Electron `sandbox`/`contextIsolation`, no `nodeIntegration`,
  a Content-Security-Policy, no `unsafe-eval` where avoidable.
- **AI data flow** — file contents sent to FreeLLMAPI; keep the unified key in
  `.env` (never bundled/committed), and treat provider responses as untrusted.
- **Dependencies** — review `npm audit` findings; prefer fixes/upgrades.

## Workflow
1. Run the automated gate (`npm run security:ci`).
2. For a deep pass, review the diff/whole tree against the focus areas above.
3. Report findings with severity + concrete fix.
4. Critical/blocking issues → add to `.github/BLOCKERS.md` and stop the merge.
