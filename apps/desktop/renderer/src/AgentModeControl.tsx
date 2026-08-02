import React, { useEffect, useRef } from 'react';
import { ProposeIcon, AutoApplyIcon, PlanIcon } from './icons';

export type AgentMode = 'manual' | 'accept' | 'plan';

// Module-level: the mode list never depends on props or state.
const MODES = [
  { id: 'manual', label: 'Manual', title: 'Propose edits — you apply them', Icon: ProposeIcon },
  { id: 'accept', label: 'Accept edits', title: 'Auto-apply the AI’s edits', Icon: AutoApplyIcon },
  { id: 'plan', label: 'Plan', title: 'Plan only — makes no file edits', Icon: PlanIcon },
] as const satisfies ReadonlyArray<{
  id: AgentMode;
  label: string;
  title: string;
  Icon: (p: { size?: number }) => React.JSX.Element;
}>;

// How the AI's file changes are handled. This lives beside Send in the composer
// rather than in the model toolbar: it decides whether the AI writes to your
// files, so it belongs where you are looking when you write the request.
export function AgentModeControl({
  mode,
  onChange,
}: {
  mode: AgentMode;
  onChange: (mode: AgentMode) => void;
}) {
  const activeIndex = MODES.findIndex((m) => m.id === mode);
  const containerRef = useRef<HTMLSpanElement>(null);
  const buttonRefs = useRef<Record<AgentMode, HTMLButtonElement | null>>({
    manual: null,
    accept: null,
    plan: null,
  });

  // Roving-tabindex radiogroups move focus together with selection (ARIA
  // Authoring Practices). We only follow the mode here if focus was already
  // inside the group — i.e. the change came from arrow-key navigation —
  // so a click (which already focuses its own button) or an unrelated
  // parent re-render never steals focus from elsewhere on the page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !container.contains(document.activeElement)) return;
    buttonRefs.current[mode]?.focus();
  }, [mode]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    onChange(MODES[(activeIndex + delta + MODES.length) % MODES.length].id);
  };

  return (
    <span
      ref={containerRef}
      className="ai-segmented"
      role="radiogroup"
      aria-label="Agent mode"
      style={{ ['--seg-index' as string]: String(Math.max(0, activeIndex)) }}
    >
      {/* One thumb slid by transform, rather than repainting three backgrounds. */}
      <span className="ai-segmented-thumb" aria-hidden />
      {MODES.map(({ id, label, title, Icon }) => (
        <button
          key={id}
          ref={(el) => {
            buttonRefs.current[id] = el;
          }}
          type="button"
          className={`ai-segmented-btn${mode === id ? ' is-active' : ''}`}
          role="radio"
          aria-checked={mode === id}
          // Only the selected radio is tabbable; arrows move within the group.
          tabIndex={mode === id ? 0 : -1}
          title={title}
          onClick={() => onChange(id)}
          onKeyDown={onKeyDown}
        >
          <Icon size={13} />
          <span className="ai-segmented-label">{label}</span>
        </button>
      ))}
    </span>
  );
}
