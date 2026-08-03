import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

  // Measure the active segment rather than assuming three equal thirds. The
  // labels are different lengths ("Accept edits" vs "Plan") and flex items will
  // not shrink below their content, so the segments are NOT equal — a fixed
  // one-third thumb lines up only on the first one and drifts off the others.
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = buttonRefs.current[mode];
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    // Re-measure when the panel is resized (labels hide at narrow widths).
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [mode]);

  return (
    <span ref={containerRef} className="ai-segmented" role="radiogroup" aria-label="Agent mode">
      {/* One thumb moved by transform, sized to the segment it sits under.
          Hidden until measured so it never flashes at the wrong place. */}
      <span
        className="ai-segmented-thumb"
        aria-hidden
        style={
          thumb
            ? { width: `${thumb.width}px`, transform: `translateX(${thumb.left}px)` }
            : { opacity: 0 }
        }
      />
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
