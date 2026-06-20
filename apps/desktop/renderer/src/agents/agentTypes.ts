// Agentic coding: a roster of single-purpose AI agents that wake on project
// changes and keep a target current (docs) or post findings (review). The model
// is "broken into agents" — each has its own persona, model, trigger and output.

// What an agent does with its output:
//  - 'doc'    → writes/updates a target doc file directly (allowlisted).
//  - 'report' → posts a read-only findings report into the Agents panel. Agents
//               never change code; the report can be handed to the main AI
//               (AI Assistant / FreeBuff) to act on.
export type AgentOutputMode = 'doc' | 'report';

// When an agent runs.
export interface AgentTrigger {
  // 'change'  → wakes when watched files change (debounced), and on demand.
  // 'manual'  → only when the user clicks Run.
  on: 'change' | 'manual';
  // Minimum gap between automatic runs (ms) — stops thrashing / token burn.
  cooldownMs: number;
}

// A built-in agent definition (a preset). User config layers on top.
export interface AgentDef {
  id: string;
  name: string;
  description: string;
  // System prompt — the agent's job. Kept tight and deterministic.
  persona: string;
  outputMode: AgentOutputMode;
  // For 'doc' agents: the workspace-relative file to keep updated.
  defaultTarget?: string;
  // Globs (workspace-relative) whose changes wake this agent.
  watch: string[];
  trigger: AgentTrigger;
  // Built-in presets can't be deleted (only disabled); custom ones can.
  builtin: boolean;
}

// Per-agent user overrides, persisted in the workspace (.strix/agents.json) so a
// team shares the same roster. Custom agents store their full def here too.
export interface AgentConfig {
  id: string;
  enabled: boolean;
  // Override the model: 'auto' (FreeLLMAPI) or 'direct:<id>'.
  model: string;
  // Override the doc target (doc agents only).
  target?: string;
  // Override the cooldown (ms).
  cooldownMs?: number;
  // Present only for user-created agents (built-ins come from presets.ts).
  custom?: AgentDef;
}

// Live run state (not persisted) for the roster UI.
export type AgentRunState = 'idle' | 'queued' | 'running' | 'ok' | 'error';

export interface AgentStatus {
  state: AgentRunState;
  // Epoch ms of the last completed run (auto or manual).
  lastRun?: number;
  // Short outcome line, e.g. "Updated README.md" or an error message.
  lastMessage?: string;
  // For 'report' agents: the latest findings text (shown in the panel, and
  // hand-offable to the main AI / FreeBuff).
  report?: string;
}

// The merged, ready-to-run view of an agent (preset/custom def + user config).
export interface ResolvedAgent extends AgentDef {
  enabled: boolean;
  model: string;
  cooldownMs: number;
  target?: string;
}
