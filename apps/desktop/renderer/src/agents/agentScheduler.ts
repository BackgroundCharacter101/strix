import type { AgentDef, AgentConfig, AgentStatus, ResolvedAgent } from './agentTypes';
import { matchAny } from './glob';

// Merge preset/custom defs with the user's per-agent config into a runnable
// roster. Config rows without a matching def (e.g. a removed preset) are dropped;
// custom configs carry their own def. Order: presets first, then custom.
export function resolveAgents(presets: AgentDef[], configs: AgentConfig[]): ResolvedAgent[] {
  const byId = new Map(configs.map((c) => [c.id, c]));
  const out: ResolvedAgent[] = [];

  for (const def of presets) {
    const cfg = byId.get(def.id);
    out.push(merge(def, cfg));
  }
  for (const cfg of configs) {
    if (cfg.custom && !presets.some((p) => p.id === cfg.id)) {
      out.push(merge(cfg.custom, cfg));
    }
  }
  return out;
}

function merge(def: AgentDef, cfg?: AgentConfig): ResolvedAgent {
  return {
    ...def,
    enabled: cfg?.enabled ?? false,
    model: cfg?.model || 'auto',
    cooldownMs: cfg?.cooldownMs ?? def.trigger.cooldownMs,
    target: cfg?.target ?? def.defaultTarget,
  };
}

// Which agents should run for a batch of changed (workspace-relative) paths.
// An agent is due when: enabled, change-triggered, at least one watched glob
// matches a changed path (other than its own target), and its cooldown elapsed.
export function dueAgents(
  agents: ResolvedAgent[],
  changedRel: string[],
  statuses: Record<string, AgentStatus | undefined>,
  now: number,
): ResolvedAgent[] {
  return agents.filter((a) => {
    if (!a.enabled || a.trigger.on !== 'change') return false;
    const relevant = changedRel.filter((p) => p !== a.target);
    if (!relevant.some((p) => matchAny(a.watch, p))) return false;
    const last = statuses[a.id]?.lastRun ?? 0;
    return now - last >= a.cooldownMs;
  });
}

// Can this agent be run right now (manual)? Only blocked while already busy.
export function canRunNow(status: AgentStatus | undefined): boolean {
  return status?.state !== 'running' && status?.state !== 'queued';
}
