# Tabea IDE — Multi-Agent Workflow System

> **Project**: Custom IDE (Zed-inspired) with self-hosted FreeLLMAPI backbone  
> **Status**: Phase 0 — Planning  
> **Last Updated**: 2026-05-23  
> **Coordination Model**: Hybrid (state files + chat context)

---

## Agent Registry

This file documents the five specialized agents that orchestrate Tabea's development in a disciplined, workflow-driven manner. All agents follow **strict validation** rules and communicate via `.github/PROJECT_STATE.json` (shared state) + chat handoff messages.

### 1. **tabea-scaffolder**

**Role**: Create monorepo structure exactly per ARCHITECTURE.md §5-6

| Aspect | Value |
|--------|-------|
| **Trigger** | User: "Run scaffolder" OR PROJECT_STATE.json `next_agent: tabea-scaffolder` |
| **Inputs** | ARCHITECTURE.md §5-6, PROJECT_STATE.json |
| **Outputs** | Monorepo package/app structure from ARCHITECTURE.md, updated PROJECT_STATE.json |
| **Phase** | 1 (Scaffolding) |
| **Validation** | Strict — fails if package names don't match ARCHITECTURE.md exactly |
| **Handoff** | Sets `next_agent: tabea-dependency-manager` |
| **Tools** | create_file, create_directory, read_file, replace_string_in_file |

**Workflow**:

```
1. Read ARCHITECTURE.md §5-6 → extract packages
2. Read PROJECT_STATE.json → validate phase
3. Create directories: apps/desktop/main, apps/desktop/renderer, packages/{editor, ai-gateway, terminal, lsp, collab, ui}, docs/
4. Initialize each with package.json (v0.1.0) + README.md + src/ or placeholder entry files
5. Update PROJECT_STATE.json → packages_scaffolded=true
6. Handoff → "✓ Scaffolding complete. Run **dependency-manager** next"
```

---

### 2. **tabea-dependency-manager**

**Role**: Align all package.json versions to ARCHITECTURE.md §4 tech stack

| Aspect | Value |
|--------|-------|
| **Trigger** | PROJECT_STATE.json `next_agent: tabea-dependency-manager` |
| **Inputs** | ARCHITECTURE.md §4, all package.json files, PROJECT_STATE.json |
| **Outputs** | Updated all package.json files, updated PROJECT_STATE.json |
| **Phase** | 2 (Dependencies) |
| **Validation** | Strict — fails if version mismatches found (e.g., React 18 vs 19) |
| **Handoff** | Sets `next_agent: tabea-deployment-orchestrator` |
| **Tools** | read_file, replace_string_in_file, run_in_terminal, grep_search |

**Workflow**:

```
1. Extract tech stack from ARCHITECTURE.md §4:
   - Electron 32, React 19, TypeScript 5, Vite 6, Tailwind 4, Node.js 22
   - Monaco, xterm.js, Yjs, openai, y-websocket, isomorphic-git, etc.
2. Validate each package.json against required versions
3. If mismatch → FAIL with detailed report
4. Update root package.json (workspaces) + all packages
5. Update PROJECT_STATE.json → dependencies_synced=true
6. Handoff → "✓ Dependencies synced. Run **deployment-orchestrator** next"
```

---

### 3. **tabea-deployment-orchestrator**

**Role**: Plan Raspberry Pi 5 FreeLLMAPI deployment (security, services, networking)

| Aspect | Value |
|--------|-------|
| **Trigger** | PROJECT_STATE.json `next_agent: tabea-deployment-orchestrator` |
| **Inputs** | ARCHITECTURE.md §9-12, PROJECT_STATE.json |
| **Outputs** | `.github/DEPLOYMENT_PLAN.md`, updated PROJECT_STATE.json |
| **Phase** | 3 (Deployment Planning) |
| **Validation** | Strict — fails if FreeLLMAPI/networking specs incomplete in ARCHITECTURE.md |
| **Handoff** | Sets `next_agent: tabea-workflow-coordinator` |
| **Tools** | read_file, create_file, replace_string_in_file, grep_search |

**Workflow**:

```
1. Extract deployment specs from ARCHITECTURE.md §9-12:
   - Pi hardware, OS, services (OpenMediaVault, pfSense, nginx, PM2)
   - FreeLLMAPI port, 14 API provider list, encryption (AES-256-GCM)
   - SQLite ledger location, firewall rules, network topology
2. Validate all specs present (not "TODO" or vague)
3. If incomplete → FAIL and ask user to clarify ARCHITECTURE.md
4. Create DEPLOYMENT_PLAN.md with detailed checklist:
   - Hardware/OS setup
   - FreeLLMAPI initialization (DB, keys, providers)
   - Network/firewall rules
   - IDE client config
   - Testing steps
   - Monitoring setup
5. Update PROJECT_STATE.json → deployment_planned=true
6. Handoff → "✓ Deployment plan created. Run **workflow-coordinator** next"
```

---

### 4. **tabea-troubleshooter**

**Role**: Diagnose & resolve cross-package issues (can be called anytime)

| Aspect | Value |
|--------|-------|
| **Trigger** | User reports error + context (can interrupt any phase) |
| **Inputs** | Error message, affected package, PROJECT_STATE.json, ARCHITECTURE.md §3/11 (data flows) |
| **Outputs** | Root cause analysis, recommended fix, updated `.github/BLOCKERS.md` if needed |
| **Phase** | Any phase (inter-phase tool) |
| **Validation** | Strict — requires error context; asks for logs/reproduction steps if missing |
| **Handoff** | Updates PROJECT_STATE.json `blockers` array; may pause workflow |
| **Tools** | read_file, grep_search, semantic_search, run_in_terminal |

**Workflow**:

```
1. Collect error context (error msg, package, reproduction steps)
2. Read PROJECT_STATE.json → determine current phase
3. Cross-reference ARCHITECTURE.md §3 (system architecture) and §11 (data flows)
4. Diagnose by checking:
   - Dependency mismatches (package.json versions)
   - Import/module resolution
   - Expected vs actual data flow
   - Architecture-level gaps
5. Recommend fix or escalate:
   - If simple fix: provide file + line changes
   - If complex: add to BLOCKERS.md for escalation
   - If architecture issue: ask user to clarify ARCHITECTURE.md
6. Update PROJECT_STATE.json → `blockers` array
7. Handoff → "✓ Issue diagnosed. [Fix/Escalation required]"
```

---

### 5. **tabea-workflow-coordinator**

**Role**: Orchestrate all agents, validate workflow state, ensure phase alignment

| Aspect | Value |
|--------|-------|
| **Trigger** | Startup, user asks "what's next?", after agent completes |
| **Inputs** | PROJECT_STATE.json, ARCHITECTURE.md, all agent outputs |
| **Outputs** | Workflow status, next agent recommendation, validation report |
| **Phase** | Meta (oversees all phases 0-5) |
| **Validation** | Strict — enforces phase ordering and state consistency |
| **Handoff** | Recommends which agent to run next |
| **Tools** | read_file, grep_search, replace_string_in_file |

**Workflow**:

```
1. Read PROJECT_STATE.json + ARCHITECTURE.md
2. Determine current phase (highest numbered complete section)
3. Validate consistency:
   - All previous phases marked complete?
   - Current phase incomplete?
   - No blockers in blockers[] array?
   - Correct next_agent field?
4. If consistent:
   - Recommend next agent
   - Produce workflow summary
5. If inconsistent → FAIL with diagnostic:
   - "Phase mismatch: packages_scaffolded=true but dependencies_synced=false"
   - Ask user: which phase to resume from?
6. On agent completion:
   - Validate outputs match expected artifacts
   - Confirm state fields updated
   - Produce summary: "✓ Phase X complete. → Next: tabea-Y-agent"
```

---

## Workflow Phases & State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 0: PLANNING (ARCHITECTURE.md complete, no code yet)      │
│ Status: project_ready = false                                  │
│ Agent: (none — manual review)                                  │
│ Output: ARCHITECTURE.md ✓                                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │ next_agent: tabea-scaffolder
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: SCAFFOLDING (Create monorepo package/app structure)   │
│ Status: packages_scaffolded = true                              │
│ Agent: tabea-scaffolder                                         │
│ Output: apps/desktop + packages/{editor, ai-gateway, terminal, lsp, collab, ui} │
└──────────────────────┬──────────────────────────────────────────┘
                       │ next_agent: tabea-dependency-manager
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: DEPENDENCIES (Align versions to ARCHITECTURE §4)       │
│ Status: dependencies_synced = true                              │
│ Agent: tabea-dependency-manager                                 │
│ Output: All package.json updated, lock files generated          │
└──────────────────────┬──────────────────────────────────────────┘
                       │ next_agent: tabea-deployment-orchestrator
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: DEPLOYMENT PLANNING (Create Pi infrastructure plan)    │
│ Status: deployment_planned = true                               │
│ Agent: tabea-deployment-orchestrator                            │
│ Output: .github/DEPLOYMENT_PLAN.md (comprehensive checklist)   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ next_agent: tabea-workflow-coordinator
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 4: INTEGRATION TESTING (Run tests, validate each package) │
│ Status: integration_tested = true                               │
│ Agent: (framework to be defined — not yet implemented)          │
│ Output: Test reports per package                                │
└──────────────────────┬──────────────────────────────────────────┘
                       │ next_agent: (to be defined)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 5: PRODUCTION DEPLOYMENT (Deploy to Pi, run IDE client)   │
│ Status: production_ready = true                                 │
│ Agent: (framework to be defined — not yet implemented)          │
│ Output: Running Tabea IDE on developer machines + Pi            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Communication Protocol

All agents use **hybrid communication**:

### 1. **Shared State File**: `.github/PROJECT_STATE.json`

```json
{
  "project": "Tabea IDE",
  "phase": "1-scaffolding",
  "status": {
    "packages_scaffolded": true,
    "dependencies_synced": false,
    "deployment_planned": false,
    "all_checks_passed": false
  },
  "last_agent": "tabea-scaffolder",
  "next_agent": "tabea-dependency-manager",
  "blockers": [],
  "notes": "Awaiting dependency manager to sync versions to ARCHITECTURE.md §4"
}
```

### 2. **Chat Handoff Message** (after each agent)

```
✓ Phase 1 Complete: Scaffolding
  7 packages created (exact match to ARCHITECTURE.md §5-6)
  Updated .github/PROJECT_STATE.json

→ Next: Run **tabea-dependency-manager**
  Goal: Sync all package.json versions to ARCHITECTURE.md §4 tech stack
```

### 3. **Blocker File**: `.github/BLOCKERS.md` (if needed)

```markdown
# Blockers

## Blocker #1: Incomplete FreeLLMAPI specs in ARCHITECTURE.md
- **Severity**: Blocking (deployment-orchestrator failed)
- **Affected Agent**: tabea-deployment-orchestrator
- **Issue**: §9 lacks list of 14 API providers + their keys
- **Resolution**: User must add provider list to ARCHITECTURE.md §9, then re-run orchestrator
```

---

## When to Run Each Agent

| Scenario | Agent(s) to Run |
|----------|-----------------|
| "Set up the monorepo" | **tabea-scaffolder** (then follow workflow) |
| "Update dependencies" | **tabea-dependency-manager** (if packages exist) |
| "Plan Pi deployment" | **tabea-deployment-orchestrator** (if dependencies synced) |
| "Something's broken" | **tabea-troubleshooter** (can run anytime) |
| "What's the status?" | **tabea-workflow-coordinator** (meta-agent) |
| "Resume work" | **tabea-workflow-coordinator** → follow recommendation |

---

## Validation Rules Summary

### For All Agents

- ✓ Read PROJECT_STATE.json before starting
- ✓ Validate against ARCHITECTURE.md (exact match, not fuzzy)
- ✓ Update PROJECT_STATE.json on completion
- ✓ Produce clear handoff message

### Strict Validation Failures

- **tabea-scaffolder**: Packages don't match ARCHITECTURE.md §5-6 exactly
- **tabea-dependency-manager**: Version mismatches (e.g., React 18 vs 19)
- **tabea-deployment-orchestrator**: FreeLLMAPI specs incomplete or unclear in ARCHITECTURE.md
- **tabea-troubleshooter**: Error context missing (requires logs/reproduction)
- **tabea-workflow-coordinator**: Phase order violated (e.g., skip Phase 2)

### Response to Validation Failure

Agents **STOP** and report:

```
ERROR: [What went wrong]
BLOCKING: [Why it's a blocker]
ACTION: [What user must do to unblock]
```

---

## Cross-Agent Dependencies

```
tabea-scaffolder
    ↓ (next_agent)
tabea-dependency-manager
    ↓ (next_agent)
tabea-deployment-orchestrator
    ↓ (next_agent)
tabea-workflow-coordinator ← oversees all phases

tabea-troubleshooter ← can interrupt any phase if error reported
```

**Each agent**:

- Reads output from previous agent(s) via PROJECT_STATE.json
- Updates PROJECT_STATE.json for next agent
- Sets `next_agent` field to recommend successor

---

## File Locations

| File | Purpose | Owner(s) |
|------|---------|----------|
| `.github/agents/tabea-scaffolder.agent.md` | Agent definition | Scaffolder |
| `.github/agents/tabea-dependency-manager.agent.md` | Agent definition | Dependency Manager |
| `.github/agents/tabea-deployment-orchestrator.agent.md` | Agent definition | Deployment Orchestrator |
| `.github/agents/tabea-troubleshooter.agent.md` | Agent definition | Troubleshooter |
| `.github/agents/tabea-workflow-coordinator.agent.md` | Agent definition | Workflow Coordinator |
| `.github/agents/tabea-deployment-executor.agent.md` | Agent definition | Deployment Executor |
| `.github/PROJECT_STATE.json` | Shared state (all agents read/write) | All agents |
| `.github/DEPLOYMENT_PLAN.md` | Pi deployment checklist | Deployment Orchestrator |
| `.github/BLOCKERS.md` | Issues blocking progress | Troubleshooter |
| `ARCHITECTURE.md` | Source of truth (all agents read) | User/Manual |
| `AGENTS.md` | This file (documentation) | All agents |

---

## Quick Start

1. **Verify ARCHITECTURE.md is complete** (no TODOs, all sections filled)
2. **Run**: Ask Copilot to invoke **tabea-scaffolder**
3. **Follow workflow**: Each agent recommends next agent via `next_agent` field
4. **Monitor status**: Run **tabea-workflow-coordinator** anytime to see progress
5. **Hit a blocker?** Run **tabea-troubleshooter** with error context

---

## Future Extensions (Phase 5)

- **tabea-ci-manager**: GitOps — automate agent workflows on push to main

## Current Phase 5 Support

- **tabea-deployment-executor**: Execute DEPLOYMENT_PLAN.md on actual Raspberry Pi

---

**Last Updated**: 2026-05-23  
**Next Review**: After Phase 1 (Scaffolding) completion
