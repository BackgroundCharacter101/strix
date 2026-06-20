import React, { useState } from 'react';
import type { UseAgents } from './agents/useAgents';
import type { AgentStatus, ResolvedAgent } from './agents/agentTypes';
import type { DirectModel } from './useSettings';
import { canRunNow } from './agents/agentScheduler';
import { EDIT_OUTPUT_CONTRACT } from './agents/presets';
import { renderMarkdown } from './markdown';
import { PlayIcon } from './icons';

// Human label for a run state.
function statusLabel(s: AgentStatus | undefined): string {
  switch (s?.state) {
    case 'running':
      return 'Running…';
    case 'queued':
      return 'Queued';
    case 'ok':
      return s.lastMessage ?? 'Done';
    case 'error':
      return s.lastMessage ?? 'Error';
    default:
      return 'Idle';
  }
}

function timeAgo(ms?: number): string {
  if (!ms) return '';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export function AgentsView({
  hub,
  directModels,
  noRoot,
}: {
  hub: UseAgents;
  directModels: DirectModel[];
  noRoot: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (noRoot) {
    return (
      <div className="agents-view">
        <div className="agents-empty">Open a folder to use coding agents.</div>
      </div>
    );
  }

  const modelOptions = (
    <>
      <option value="auto">Auto (router)</option>
      {directModels.map((d) => (
        <option key={d.id} value={`direct:${d.id}`}>
          {d.label || d.model}
        </option>
      ))}
    </>
  );

  return (
    <div className="agents-view">
      <div className="agents-head">
        <span className="agents-title">Agents</span>
        <label className="agents-pause">
          <input
            type="checkbox"
            checked={hub.paused}
            onChange={(e) => hub.setPaused(e.target.checked)}
          />
          Pause all
        </label>
      </div>
      <p className="agents-note">
        Each agent watches the project and runs on changes (after you go idle) or on demand. Doc
        agents update their file; review agents post a read-only report below.
      </p>

      <ul className="agents-list">
        {hub.agents.map((a) => (
          <AgentRow
            key={a.id}
            agent={a}
            status={hub.statuses[a.id]}
            modelOptions={modelOptions}
            open={open === a.id}
            onToggleOpen={() => setOpen((o) => (o === a.id ? null : a.id))}
            onEnable={(v) => hub.setConfig(a.id, { enabled: v })}
            onModel={(m) => hub.setConfig(a.id, { model: m })}
            onRun={() => hub.runNow(a.id)}
            onUndo={() => hub.undoAgent(a.id)}
            onRemove={a.builtin ? undefined : () => hub.removeCustom(a.id)}
          />
        ))}
      </ul>

      {adding ? (
        <AddAgent
          onCancel={() => setAdding(false)}
          onAdd={(cfg) => {
            hub.addCustom(cfg);
            setAdding(false);
          }}
        />
      ) : (
        <button type="button" className="agents-add-btn" onClick={() => setAdding(true)}>
          + Custom agent
        </button>
      )}
    </div>
  );
}

function AgentRow({
  agent,
  status,
  modelOptions,
  open,
  onToggleOpen,
  onEnable,
  onModel,
  onRun,
  onUndo,
  onRemove,
}: {
  agent: ResolvedAgent;
  status: AgentStatus | undefined;
  modelOptions: React.ReactNode;
  open: boolean;
  onToggleOpen: () => void;
  onEnable: (v: boolean) => void;
  onModel: (m: string) => void;
  onRun: () => void;
  onUndo: () => void;
  onRemove?: () => void;
}) {
  const hasReport = agent.outputMode === 'report' && !!status?.report;
  const canUndo = agent.outputMode === 'edit' && !!status?.undo?.length;
  const badge =
    agent.outputMode === 'doc' ? agent.target : agent.outputMode === 'edit' ? 'edits code' : 'report';
  return (
    <li className={`agent-row agent-${status?.state ?? 'idle'}`}>
      <div className="agent-main">
        <label className="agent-enable" title={agent.enabled ? 'Enabled' : 'Disabled'}>
          <input type="checkbox" checked={agent.enabled} onChange={(e) => onEnable(e.target.checked)} />
        </label>
        <div className="agent-text">
          <div className="agent-name">
            {agent.name}
            <span className={`agent-badge agent-badge-${agent.outputMode}`}>{badge}</span>
          </div>
          <div className="agent-desc">{agent.description}</div>
          <div className="agent-status">
            <span className={`agent-dot agent-dot-${status?.state ?? 'idle'}`} />
            {statusLabel(status)}
            {status?.lastRun ? <span className="agent-ago"> · {timeAgo(status.lastRun)}</span> : null}
          </div>
        </div>
        <div className="agent-actions">
          <select
            aria-label={`${agent.name} model`}
            value={agent.model}
            onChange={(e) => onModel(e.target.value)}
          >
            {modelOptions}
          </select>
          <button
            type="button"
            className="agent-run"
            title="Run now"
            disabled={!canRunNow(status)}
            onClick={onRun}
          >
            <PlayIcon />
          </button>
          {hasReport && (
            <button type="button" className="agent-report-toggle" onClick={onToggleOpen}>
              {open ? 'Hide' : 'Report'}
            </button>
          )}
          {canUndo && (
            <button
              type="button"
              className="agent-report-toggle"
              title="Revert this agent's last change"
              onClick={onUndo}
            >
              Undo
            </button>
          )}
          {onRemove && (
            <button type="button" className="agent-remove" title="Delete agent" onClick={onRemove}>
              ×
            </button>
          )}
        </div>
      </div>
      {open && hasReport && (
        <div className="agent-report ai-md">{renderMarkdown(status?.report ?? '')}</div>
      )}
    </li>
  );
}

function AddAgent({
  onAdd,
  onCancel,
}: {
  onAdd: (cfg: import('./agents/agentTypes').AgentConfig) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [persona, setPersona] = useState('');
  const [mode, setMode] = useState<'doc' | 'edit' | 'report'>('report');
  const [target, setTarget] = useState('docs/NOTES.md');

  const add = () => {
    const n = name.trim();
    const p = persona.trim();
    if (!n || !p) return;
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `agent_${Date.now()}`;
    // Edit agents must return the strict JSON plan, so append the contract.
    const personaFull = mode === 'edit' ? p + EDIT_OUTPUT_CONTRACT : p;
    onAdd({
      id,
      enabled: true,
      model: 'auto',
      custom: {
        id,
        name: n,
        description: 'Custom agent',
        persona: personaFull,
        outputMode: mode,
        defaultTarget: mode === 'doc' ? target.trim() : undefined,
        watch: ['**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php,c,cpp,h,cs,json,md}'],
        trigger: { on: 'change', cooldownMs: 5 * 60 * 1000 },
        builtin: false,
      },
      target: mode === 'doc' ? target.trim() : undefined,
    });
  };

  return (
    <div className="agent-add">
      <input
        type="text"
        aria-label="Agent name"
        placeholder="Agent name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        aria-label="Agent instructions"
        placeholder="What should this agent do? (its system prompt)"
        rows={3}
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
      />
      <div className="agent-add-mode">
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'report'}
            onChange={() => setMode('report')}
          />
          Report
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'edit'}
            onChange={() => setMode('edit')}
          />
          Edit code
        </label>
        <label>
          <input type="radio" name="mode" checked={mode === 'doc'} onChange={() => setMode('doc')} />
          Write doc
        </label>
        {mode === 'doc' && (
          <input
            type="text"
            aria-label="Target file"
            placeholder="docs/NOTES.md"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        )}
      </div>
      <div className="agent-add-actions">
        <button type="button" className="agents-add-btn" disabled={!name.trim() || !persona.trim()} onClick={add}>
          Add
        </button>
        <button type="button" className="agent-add-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
