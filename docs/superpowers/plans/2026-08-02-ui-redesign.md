# Strix UI Redesign — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Strix a macOS-flavoured design language as reusable tokens, then apply it to the Source Control panel and the AI composer so agent mode is obvious and both panels have real hierarchy.

**Architecture:** Additive control-level tokens in `tokens.css` (existing `--space-*`/`--radius-*` scales keep their values, so untouched surfaces cannot shift). The AI mode selector moves out of the crowded toolbar row into the composer as a real segmented control. Source Control collapses its branch bar + always-visible "New branch…" row into one branch button backed by a new `BranchMenu` component, and demotes "Create Pull Request" into a header overflow menu so `Commit` is the only primary action.

**Tech Stack:** React 19, TypeScript 5 (strict), plain CSS with custom properties, Vitest + @testing-library/react (jsdom), ESLint flat config.

**Spec:** `docs/superpowers/specs/2026-08-02-ui-redesign-design.md`

## Global Constraints

- Amber accent is preserved. Do not replace `--accent` / `--statusbar` with a neutral or blue.
- Materials (`backdrop-filter`) stay confined to chrome overlays. Do not add blur to panels, the editor, or code.
- `--text-2xs` is for badges and counts only. No text a user is meant to read may be smaller than `--text-xs` (11px).
- Do NOT change existing `--space-*` or `--radius-*` token values. Add new tokens instead.
- **New** files stay under 500 lines (project rule). Two existing files are already over and are out
  of scope to split in this slice: `AiPanel.tsx` (2,272 lines) and `AiPanel.test.tsx` (577). Neither
  may grow materially — new UI for them goes into its own component + test file instead. That is why
  Task 3 creates `AgentModeControl.tsx` and Task 5 creates `BranchMenu.tsx`.
  `SourceControlView.tsx` is at 491 lines and MUST end this slice under 500.
- Animate only `opacity` and `transform`. Every animation needs a `@media (prefers-reduced-motion: reduce)` branch.
- No `Co-Authored-By` trailer in commits (project rule).
- Renderer tests need `// @vitest-environment jsdom` as line 1 and `import '@testing-library/jest-dom/vitest'`.
- Run `npm run typecheck && npm run lint && npm test` before each commit.

---

### Task 1: Control tokens and the 9px fix

**Files:**
- Modify: `apps/desktop/renderer/tokens.css` (add control block; change `--text-2xs`)
- Test: `apps/desktop/renderer/src/tokens.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties `--control-h`, `--control-h-sm`, `--control-radius`, `--card-radius`, `--field-h`, `--panel-gutter`, `--panel-gap`, `--section-gap`, all defined on `:root`. Every later task references these names exactly.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/renderer/src/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '..', 'tokens.css'), 'utf8');

function tokenValue(name: string): string | null {
  // First definition wins — that is the :root (dark) block.
  const m = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(css);
  return m ? m[1].trim() : null;
}

describe('control tokens', () => {
  it('defines one control height, radius, and panel gutter', () => {
    expect(tokenValue('--control-h')).toBe('28px');
    expect(tokenValue('--control-h-sm')).toBe('22px');
    expect(tokenValue('--control-radius')).toBe('7px');
    expect(tokenValue('--card-radius')).toBe('10px');
    expect(tokenValue('--field-h')).toBe('28px');
    expect(tokenValue('--panel-gutter')).toBe('12px');
    expect(tokenValue('--panel-gap')).toBe('8px');
    expect(tokenValue('--section-gap')).toBe('16px');
  });
});

describe('type scale', () => {
  it('no longer bottoms out at 9px', () => {
    const smallest = Number((tokenValue('--text-2xs') ?? '').replace('px', ''));
    expect(smallest).toBeGreaterThanOrEqual(10);
  });

  it('keeps the readable steps the panels should use', () => {
    expect(tokenValue('--text-xs')).toBe('11px');
    expect(tokenValue('--text-sm')).toBe('12px');
    expect(tokenValue('--text-base')).toBe('13px');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/tokens.test.ts`
Expected: FAIL — `expected null to be '28px'` for `--control-h`, and `--text-2xs` is 9.

- [ ] **Step 3: Add the tokens**

In `apps/desktop/renderer/tokens.css`, change the existing line `  --text-2xs: 9px;` to:

```css
  --text-2xs: 10px;
```

Then, immediately after the line `  --radius: var(--radius-md);` (the back-compat alias at the end of the `:root` semantic block, just before its closing `}`), insert:

```css

  /* =======================================================================
     CONTROLS — macOS-flavoured sizing. Additive on purpose: the --space-*
     and --radius-* scales keep their values so surfaces that have not been
     migrated yet cannot shift underneath us.
     ======================================================================= */
  --control-h: 28px;        /* buttons, selects, segmented controls */
  --control-h-sm: 22px;     /* inline row actions (stash Pop/Apply/Drop) */
  --control-radius: 7px;    /* softer than the old 4px */
  --card-radius: 10px;
  --field-h: 28px;          /* text inputs match button height */
  --panel-gutter: 12px;     /* ONE horizontal gutter for panel content */
  --panel-gap: 8px;         /* rhythm between blocks inside a panel */
  --section-gap: 16px;      /* between major sections */
```

- [ ] **Step 4: Add the compact-density overrides**

The app already ships a density switch implemented as `:root[data-density='compact'] .some-class`
rules near the top of `styles.css`. The new control tokens must honour it, or "compact" silently
stops working for everything built on them. Append to `apps/desktop/renderer/styles.css`:

```css
/* Compact density tightens the control scale itself, so every surface built on
   these tokens shrinks together instead of needing its own override. */
:root[data-density='compact'] {
  --control-h: 24px;
  --control-h-sm: 20px;
  --field-h: 24px;
  --panel-gutter: 10px;
  --panel-gap: 6px;
  --section-gap: 12px;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run apps/desktop/renderer/src/tokens.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Verify nothing else broke**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck and lint silent; full suite green (463 tests + 3 new = 466).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/tokens.css apps/desktop/renderer/styles.css apps/desktop/renderer/src/tokens.test.ts
git commit -m "feat(ui): add control sizing tokens and lift the type floor off 9px"
```

---

### Task 2: Agent-mode icons

**Files:**
- Modify: `apps/desktop/renderer/src/icons.tsx` (append three icons)
- Test: `apps/desktop/renderer/src/icons.test.tsx` (create)

**Interfaces:**
- Consumes: the existing `base(size)` helper and `IconProps` type already defined at the top of `icons.tsx`.
- Produces: `ProposeIcon`, `AutoApplyIcon`, `PlanIcon` — each `({ size }: { size?: number }) => JSX.Element`, default size 14, rendering an `<svg>` that inherits `currentColor`. Task 3 imports all three.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/renderer/src/icons.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { ProposeIcon, AutoApplyIcon, PlanIcon } from './icons';

describe('agent mode icons', () => {
  it('render an svg that inherits currentColor', () => {
    for (const Icon of [ProposeIcon, AutoApplyIcon, PlanIcon]) {
      const { container, unmount } = render(<Icon />);
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      unmount();
    }
  });

  it('respect the size prop', () => {
    const { container } = render(<PlanIcon size={20} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('20');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/icons.test.tsx`
Expected: FAIL — `ProposeIcon is not exported` / import error.

- [ ] **Step 3: Add the icons**

Append to the end of `apps/desktop/renderer/src/icons.tsx`:

```tsx
// --- Agent mode icons (AI composer segmented control) ---------------------
// Manual: the AI proposes an edit and you apply it — a pencil.
export function ProposeIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20z" />
    </svg>
  );
}

// Accept edits: the AI writes to the file itself — a check.
export function AutoApplyIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 12.5l5.2 5.2L20 7" />
    </svg>
  );
}

// Plan: think it through, change nothing — a checklist.
export function PlanIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 6.5h3.4M4 12h3.4M4 17.5h3.4" />
      <path d="M11 6.5h9M11 12h9M11 17.5h6" />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/desktop/renderer/src/icons.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/src/icons.tsx apps/desktop/renderer/src/icons.test.tsx
git commit -m "feat(ui): add propose/auto-apply/plan icons for the agent mode control"
```

---

### Task 3: Move the mode selector into the composer

The control currently lives in the model toolbar at `AiPanel.tsx` around line 1705 (`<span className="ai-mode" …>`), rendered at `--text-2xs` with `2px 9px` padding and pushed right by `margin-left:auto`. It moves into `.ai-actions` (around line 2197), left of the attach + Send buttons.

**Files:**
- Create: `apps/desktop/renderer/src/AgentModeControl.tsx`
- Test: `apps/desktop/renderer/src/AgentModeControl.test.tsx` (create)
- Modify: `apps/desktop/renderer/src/AiPanel.tsx` (remove old block ~1704-1725; render the new
  component inside `.ai-actions`; fix empty-state copy ~1853)
- Modify: `apps/desktop/renderer/styles.css` (replace the `.ai-mode` rules near line 4900)

`AiPanel.tsx` is 2,272 lines and must not grow materially, so the control is its own component and
its tests are their own file rather than appended to the 577-line `AiPanel.test.tsx`.

**Interfaces:**
- Consumes: `ProposeIcon`, `AutoApplyIcon`, `PlanIcon` from Task 2; `--control-h`, `--control-radius` from Task 1.
- Produces:
  ```ts
  export type AgentMode = 'manual' | 'accept' | 'plan';
  export function AgentModeControl(props: {
    mode: AgentMode;
    onChange: (mode: AgentMode) => void;
  }): JSX.Element
  ```
  Renders a `role="radiogroup"` with `aria-label="Agent mode"` containing three `role="radio"`
  buttons whose accessible names are exactly `Manual`, `Accept edits`, and `Plan`. Task 4 keys off
  the same `agentMode` state in `AiPanel`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/renderer/src/AgentModeControl.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentModeControl } from './AgentModeControl';

describe('AgentModeControl', () => {
  it('renders all three modes as one radiogroup', () => {
    render(<AgentModeControl mode="manual" onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Agent mode' })).toBeInTheDocument();
    for (const name of ['Manual', 'Accept edits', 'Plan']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
  });

  it('marks exactly one mode active', () => {
    render(<AgentModeControl mode="plan" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Plan' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Manual' })).toHaveAttribute('aria-checked', 'false');
  });

  it('reports the picked mode on click', () => {
    const onChange = vi.fn();
    render(<AgentModeControl mode="manual" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Accept edits' }));
    expect(onChange).toHaveBeenCalledWith('accept');
  });

  it('moves to the next mode with ArrowRight and wraps with ArrowLeft', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AgentModeControl mode="manual" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Manual' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('accept');

    onChange.mockClear();
    rerender(<AgentModeControl mode="manual" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Manual' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('plan');
  });

  it('keeps only the active mode in the tab order', () => {
    render(<AgentModeControl mode="accept" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Accept edits' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Manual' })).toHaveAttribute('tabindex', '-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/AgentModeControl.test.tsx`
Expected: FAIL — cannot resolve `./AgentModeControl`.

- [ ] **Step 2b: Write the component**

Create `apps/desktop/renderer/src/AgentModeControl.tsx`:

```tsx
import React from 'react';
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

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    onChange(MODES[(activeIndex + delta + MODES.length) % MODES.length].id);
  };

  return (
    <span
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
```

- [ ] **Step 2c: Run test to verify it passes**

Run: `npx vitest run apps/desktop/renderer/src/AgentModeControl.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 3: Remove the old control from the toolbar**

In `apps/desktop/renderer/src/AiPanel.tsx`, delete this whole block (the comment line plus the `<span className="ai-mode">…</span>` element, ~lines 1704-1725):

```tsx
        {/* Agent mode: how the AI's file changes are handled. */}
        <span className="ai-mode" role="radiogroup" aria-label="Agent mode">
          {(
            [
              ['manual', 'Manual', 'Propose edits — you apply them'],
              ['accept', 'Accept edits', 'Auto-apply the AI’s edits'],
              ['plan', 'Plan', 'Plan only — makes no file edits'],
            ] as const
          ).map(([m, label, title]) => (
            <button
              key={m}
              type="button"
              className={`ai-mode-btn${agentMode === m ? ' is-active' : ''}`}
              role="radio"
              aria-checked={agentMode === m}
              title={title}
              onClick={() => setAgentMode(m)}
            >
              {label}
            </button>
          ))}
        </span>
```

- [ ] **Step 4: Render the control in the composer**

Add the import near the other local imports at the top of `AiPanel.tsx`:

```tsx
import { AgentModeControl } from './AgentModeControl';
```

In `AiPanel.tsx`, find `<div className="ai-actions">` (~line 2197) and insert this as its **first
child**, before the attach button:

```tsx
          <AgentModeControl mode={agentMode} onChange={setAgentMode} />
```

`agentMode` and `setAgentMode` are the existing state declared near line 443; do not duplicate them.
If TypeScript objects that `setAgentMode` is not assignable to `(mode: AgentMode) => void`, import
the exported type and use it for the state instead of the inline union:

```tsx
import { AgentModeControl, type AgentMode } from './AgentModeControl';
// …
const [agentMode, setAgentMode] = useState<AgentMode>(/* keep the existing initialiser */);
```

- [ ] **Step 5: Fix the now-wrong empty-state copy**

Around line 1853 of `AiPanel.tsx`, the empty state reads "pick a mode above". Change that sentence to:

```tsx
                Chat to explain, fix or refactor — pick a mode below (Manual /
                Accept edits / Plan). Type <strong>/</strong> to call an agent.
```

- [ ] **Step 6: Replace the CSS**

In `apps/desktop/renderer/styles.css`, delete the old block that starts with the comment `/* Agent mode segmented control (Manual / Accept edits / Plan). */` and covers `.ai-mode`, `.ai-mode-btn`, `.ai-mode-btn:hover`, and `.ai-mode-btn.is-active` (near line 4900). Replace it with:

```css
/* Agent mode segmented control — lives in the composer, next to Send, because
   it decides whether the AI writes to your files. It used to be 9px text in the
   corner of the toolbar: highest consequence, lowest visibility. */
.ai-segmented {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: var(--control-h);
  padding: 2px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
}

/* One thumb slid by transform, rather than repainting three backgrounds. */
.ai-segmented-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc((100% - 4px) / 3);
  height: calc(100% - 4px);
  background: var(--accent);
  border-radius: calc(var(--control-radius) - 2px);
  transform: translateX(calc(var(--seg-index, 0) * 100%));
  transition: transform 180ms cubic-bezier(0.32, 0.72, 0, 1);
}

.ai-segmented-btn {
  position: relative; /* above the thumb */
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  flex: 1 1 0;
  padding: 0 var(--space-4);
  height: 100%;
  font-size: var(--text-sm);
  color: var(--text-muted);
  background: transparent;
  border: 0;
  border-radius: calc(var(--control-radius) - 2px);
  cursor: pointer;
  white-space: nowrap;
  transition: color 150ms ease-out;
}

.ai-segmented-btn:hover {
  color: var(--text);
}

.ai-segmented-btn.is-active {
  color: var(--accent-ink);
}

.ai-segmented-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

/* The panel gets narrow; drop the labels before the control overflows. */
@media (max-width: 380px) {
  .ai-segmented-label {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-segmented-thumb {
    transition: none;
  }
}
```

- [ ] **Step 7: Confirm the control moved, not duplicated**

Run: `npx grep -rn "ai-mode-btn\|className=\"ai-mode\"" apps/desktop/renderer/src apps/desktop/renderer/styles.css`
Expected: no matches. The old toolbar control and its CSS are gone, not merely hidden.

- [ ] **Step 8: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green. Pre-existing `AiPanel.test.tsx` cases that asserted on the old toolbar control
must be updated to the new markup — the control intentionally no longer lives there.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/renderer/src/AgentModeControl.tsx apps/desktop/renderer/src/AgentModeControl.test.tsx apps/desktop/renderer/src/AiPanel.tsx apps/desktop/renderer/src/AiPanel.test.tsx apps/desktop/renderer/styles.css
git commit -m "feat(ui): move agent mode into the composer as a real segmented control"
```

---

### Task 4: Ambient Accept-edits signal

Accept-edits means the AI writes to files without asking. That state should be visible without being read.

**Files:**
- Modify: `apps/desktop/renderer/src/AiPanel.tsx` (class on the composer wrapper)
- Modify: `apps/desktop/renderer/styles.css` (append one rule)
- Test: `apps/desktop/renderer/src/AgentModeControl.test.tsx` (append one case)

**Interfaces:**
- Consumes: `agentMode` / `autoApplyOn` state in `AiPanel` and the control from Task 3.
- Produces: the class `is-accept-mode` on the `.ai-composer` element whenever `agentMode === 'accept'`.

- [ ] **Step 1: Write the failing test**

The class is applied by `AiPanel`, but `AiPanel.test.tsx` is already 577 lines and must not grow.
Assert the rule directly instead — append to `apps/desktop/renderer/src/AgentModeControl.test.tsx`:

```tsx
describe('accept-edits ambient signal', () => {
  it('is styled so the composer shows when the AI may write files', () => {
    const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
    expect(css).toMatch(/\.ai-composer\.is-accept-mode\s*\{/);
  });
});
```

Add these imports at the top of that test file:

```tsx
import { readFileSync } from 'fs';
import { join } from 'path';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/AgentModeControl.test.tsx -t "may write files"`
Expected: FAIL — no `.ai-composer.is-accept-mode` rule exists yet.

- [ ] **Step 3: Add the class**

In `AiPanel.tsx`, change the composer wrapper (~line 2020) from:

```tsx
      <div className="ai-composer">
```

to:

```tsx
      <div className={`ai-composer${autoApplyOn ? ' is-accept-mode' : ''}`}>
```

(`autoApplyOn` is the existing derived boolean `agentMode === 'accept'`, declared near line 446.)

- [ ] **Step 4: Add the CSS**

Append to `apps/desktop/renderer/styles.css`, directly after the `.ai-segmented` block from Task 3:

```css
/* Accept-edits writes to files without asking. Tint the composer so that state
   is ambient rather than something you have to go and read. */
.ai-composer.is-accept-mode {
  box-shadow: inset 0 0 0 1px var(--accent);
  border-radius: var(--control-radius);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run apps/desktop/renderer/src/AgentModeControl.test.tsx`
Expected: PASS

- [ ] **Step 6: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/src/AiPanel.tsx apps/desktop/renderer/src/AgentModeControl.test.tsx apps/desktop/renderer/styles.css
git commit -m "feat(ui): tint the composer while accept-edits mode is active"
```

---

### Task 5: Extract BranchMenu

`SourceControlView.tsx` is 491 lines against a 500-line limit, so the branch picker lands in its own file before Task 6 adds anything.

**Files:**
- Create: `apps/desktop/renderer/src/BranchMenu.tsx`
- Test: `apps/desktop/renderer/src/BranchMenu.test.tsx` (create)
- Modify: `apps/desktop/renderer/styles.css` (append menu styles)

**Interfaces:**
- Consumes: `--control-h`, `--control-radius`, `--card-radius`, `--panel-gutter` from Task 1; `GitBranchIcon` from `./icons`.
- Produces:
  ```ts
  export function BranchMenu(props: {
    current: string | null;
    branches: string[];
    busy: boolean;
    onSwitch: (ref: string) => void;
    onCreate: (name: string) => void;
  }): JSX.Element
  ```
  Task 6 renders exactly this. The trigger button's accessible name is `Branch: <current>` (or `Branch: detached HEAD` when `current` is null).

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/renderer/src/BranchMenu.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BranchMenu } from './BranchMenu';

const props = {
  current: 'main',
  branches: ['main', 'feature/greeting'],
  busy: false,
  onSwitch: vi.fn(),
  onCreate: vi.fn(),
};

describe('BranchMenu', () => {
  it('shows the current branch on the trigger', () => {
    render(<BranchMenu {...props} />);
    expect(screen.getByRole('button', { name: 'Branch: main' })).toBeInTheDocument();
  });

  it('lists branches once opened and switches on click', () => {
    const onSwitch = vi.fn();
    render(<BranchMenu {...props} onSwitch={onSwitch} />);
    // Closed to begin with — the list is not in the document.
    expect(screen.queryByRole('menuitem', { name: 'feature/greeting' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Branch: main' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'feature/greeting' }));
    expect(onSwitch).toHaveBeenCalledWith('feature/greeting');
  });

  it('creates a branch from the inline field', () => {
    const onCreate = vi.fn();
    render(<BranchMenu {...props} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Branch: main' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New branch…' }));
    const field = screen.getByLabelText('New branch name');
    fireEvent.change(field, { target: { value: 'feat/x' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCreate).toHaveBeenCalledWith('feat/x');
  });

  it('closes on Escape', () => {
    render(<BranchMenu {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Branch: main' }));
    expect(screen.getByRole('menuitem', { name: 'feature/greeting' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menuitem', { name: 'feature/greeting' })).toBeNull();
  });

  it('reads as detached HEAD when there is no branch', () => {
    render(<BranchMenu {...props} current={null} />);
    expect(screen.getByRole('button', { name: 'Branch: detached HEAD' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/BranchMenu.test.tsx`
Expected: FAIL — cannot resolve `./BranchMenu`.

- [ ] **Step 3: Write the component**

Create `apps/desktop/renderer/src/BranchMenu.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { GitBranchIcon } from './icons';

// The branch control for Source Control: one button showing where you are,
// opening a menu of local branches plus "New branch…". This replaces a bare
// <select> AND a permanently visible "New branch…" input — a whole row spent on
// an action taken maybe once a week.
export function BranchMenu({
  current,
  branches,
  busy,
  onSwitch,
  onCreate,
}: {
  current: string | null;
  branches: string[];
  busy: boolean;
  onSwitch: (ref: string) => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape or a click outside, like every other menu in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setCreating(false);
    setName('');
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    close();
  };

  return (
    <div className="scm-branch" ref={wrapRef}>
      <button
        type="button"
        className="scm-branch-btn"
        aria-label={`Branch: ${current ?? 'detached HEAD'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        <GitBranchIcon size={13} />
        <span className="scm-branch-name">{current ?? 'detached HEAD'}</span>
        <span className="scm-branch-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="scm-branch-menu" role="menu">
          {branches.map((b) => (
            <button
              key={b}
              type="button"
              role="menuitem"
              className={`scm-branch-item${b === current ? ' is-current' : ''}`}
              onClick={() => {
                close();
                if (b !== current) onSwitch(b);
              }}
            >
              <span className="scm-branch-check" aria-hidden>
                {b === current ? '✓' : ''}
              </span>
              {b}
            </button>
          ))}

          <div className="scm-branch-sep" role="separator" />

          {creating ? (
            <input
              className="scm-branch-input"
              aria-label="New branch name"
              placeholder="branch name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          ) : (
            <button
              type="button"
              role="menuitem"
              className="scm-branch-item"
              onClick={() => setCreating(true)}
            >
              <span className="scm-branch-check" aria-hidden>
                +
              </span>
              New branch…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the CSS**

Append to `apps/desktop/renderer/styles.css`:

```css
/* --- Source Control branch control ------------------------------------- */
.scm-branch {
  position: relative;
}

.scm-branch-btn {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  height: var(--control-h);
  padding: 0 var(--space-4);
  font-size: var(--text-base);
  color: var(--text);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
  cursor: pointer;
}

.scm-branch-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.scm-branch-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.scm-branch-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.scm-branch-caret {
  flex: 0 0 auto;
  color: var(--text-muted);
}

.scm-branch-menu {
  position: absolute;
  z-index: 30; /* matches the existing in-panel dropdown convention */
  top: calc(var(--control-h) + 4px);
  left: 0;
  right: 0;
  padding: var(--space-2);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-modal);
  max-height: 320px;
  overflow-y: auto;
}

.scm-branch-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: var(--control-h);
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--text);
  background: transparent;
  border: 0;
  border-radius: calc(var(--control-radius) - 2px);
  cursor: pointer;
  text-align: left;
}

.scm-branch-item:hover {
  background: var(--bg-hover);
}

.scm-branch-item.is-current {
  color: var(--accent);
}

.scm-branch-check {
  flex: 0 0 14px;
  color: var(--accent);
}

.scm-branch-sep {
  height: 1px;
  margin: var(--space-2) 0;
  background: var(--border);
}

.scm-branch-input {
  width: 100%;
  height: var(--field-h);
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--bg-input);
  border: 1px solid var(--focus);
  border-radius: calc(var(--control-radius) - 2px);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/desktop/renderer/src/BranchMenu.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/src/BranchMenu.tsx apps/desktop/renderer/src/BranchMenu.test.tsx apps/desktop/renderer/styles.css
git commit -m "feat(ui): add BranchMenu — one branch control with inline create"
```

---

### Task 6: Rebuild the Source Control header

Replaces the `<select>` branch bar and the always-visible "New branch…" row with `BranchMenu`, and moves Create Pull Request into a header overflow menu so `Commit` is the only primary button.

**Files:**
- Modify: `apps/desktop/renderer/src/SourceControlView.tsx`
- Modify: `apps/desktop/renderer/styles.css`
- Test: `apps/desktop/renderer/src/SourceControlView.test.tsx` (append cases)

**Interfaces:**
- Consumes: `BranchMenu` from Task 5 (`current`, `branches`, `busy`, `onSwitch`, `onCreate`); tokens from Task 1.
- Produces: a header overflow button with accessible name `More source control actions`, and a primary commit button whose accessible name is `Commit on <branch>`.

- [ ] **Step 1: Write the failing test**

Append to `apps/desktop/renderer/src/SourceControlView.test.tsx`:

```tsx
describe('Source Control header', () => {
  it('shows the branch as one control and no standing new-branch field', async () => {
    status.mockResolvedValue({ isRepo: true, branch: 'main', files: [], root: '/r' });
    render(<SourceControlView rootPath="/r" onOpenDiff={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Branch: main' })).toBeInTheDocument();
    // The always-visible "New branch…" input is gone; it lives in the menu now.
    expect(screen.queryByLabelText('New branch name')).toBeNull();
  });

  it('names the primary action after the branch it commits to', async () => {
    status.mockResolvedValue({ isRepo: true, branch: 'main', files: [], root: '/r' });
    render(<SourceControlView rootPath="/r" onOpenDiff={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Commit on main' })).toBeInTheDocument();
  });

  it('keeps Create Pull Request reachable from the overflow menu', async () => {
    status.mockResolvedValue({ isRepo: true, branch: 'main', files: [], root: '/r' });
    render(<SourceControlView rootPath="/r" onOpenDiff={vi.fn()} />);
    const more = await screen.findByRole('button', { name: 'More source control actions' });
    // Not on screen until asked for.
    expect(screen.queryByRole('menuitem', { name: 'Create Pull Request' })).toBeNull();
    fireEvent.click(more);
    expect(screen.getByRole('menuitem', { name: 'Create Pull Request' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/SourceControlView.test.tsx -t "Source Control header"`
Expected: FAIL — no `Branch: main` button (still a `<select>`), no overflow menu.

- [ ] **Step 3: Import BranchMenu and add overflow state**

At the top of `SourceControlView.tsx`, add to the imports:

```tsx
import { BranchMenu } from './BranchMenu';
```

Next to the other `useState` calls in the component (near `const [newBranch, setNewBranch] = useState('')`), add:

```tsx
  const [moreOpen, setMoreOpen] = useState(false);
```

Delete the now-unused `newBranch` state line and the `makeBranch` handler's dependence on it — `makeBranch` becomes:

```tsx
  const makeBranch = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void guard(async () => {
      await window.strix.git.createBranch(rootPath!, trimmed);
      showToast(`Created and switched to ${trimmed}`, 'success', 2500);
    });
  };
```

- [ ] **Step 4: Replace the branch bar and new-branch row**

In the returned JSX, replace the entire `<div className="scm-branchbar">…</div>` block **and** the entire `<div className="scm-newbranch">…</div>` block with:

```tsx
      <div className="scm-branchbar">
        <BranchMenu
          current={status.branch}
          branches={branches?.branches ?? (status.branch ? [status.branch] : [])}
          busy={busy}
          onSwitch={switchBranch}
          onCreate={makeBranch}
        />
        <div className="scm-syncrow">
          <button
            type="button"
            className="scm-sync-btn"
            title="Pull (fast-forward) from origin"
            disabled={syncBusy}
            onClick={() => sync('pull')}
          >
            ↓ Pull
          </button>
          <button
            type="button"
            className="scm-sync-btn"
            title="Push to origin"
            disabled={syncBusy}
            onClick={() => sync('push')}
          >
            ↑ Push
          </button>
          <button
            type="button"
            className="scm-sync-btn scm-sync-primary"
            title="Sync — pull then push (publishes the branch if it has no upstream)"
            disabled={syncBusy}
            onClick={() => sync('sync')}
          >
            {syncBusy ? '…' : '⟲ Sync'}
          </button>
        </div>
      </div>
```

- [ ] **Step 5: Add the header overflow menu**

Immediately inside the root `<div className="scm-view" …>`, before the `.scm-branchbar` block, add:

```tsx
      <div className="scm-head">
        <span className="scm-head-title">Source Control</span>
        <div className="scm-more">
          <button
            type="button"
            className="scm-more-btn"
            aria-label="More source control actions"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            ⋯
          </button>
          {moreOpen && (
            <div className="scm-more-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="scm-branch-item"
                disabled={prBusy}
                onClick={() => {
                  setMoreOpen(false);
                  void createPr();
                }}
              >
                {prBusy ? 'Creating…' : 'Create Pull Request'}
              </button>
            </div>
          )}
        </div>
      </div>
```

Then **delete** the standalone `<button className="scm-pr-btn">…Create Pull Request…</button>` from the commit block.

- [ ] **Step 6: Make Commit the single primary action**

Replace the commit button with one that names its target branch:

```tsx
        <button
          type="button"
          className="scm-commit-btn"
          disabled={busy || message.trim().length === 0 || staged.length === 0}
          onClick={commit}
        >
          Commit on {status.branch ?? 'HEAD'}
          {staged.length ? ` (${staged.length})` : ''}
        </button>
```

- [ ] **Step 7: Add the CSS**

Append to `apps/desktop/renderer/styles.css`:

```css
/* --- Source Control header + sync row ---------------------------------- */
.scm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--panel-gutter);
}

.scm-head-title {
  font-size: var(--text-2xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-muted);
}

.scm-more {
  position: relative;
}

.scm-more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--control-h-sm);
  height: var(--control-h-sm);
  color: var(--text-muted);
  background: transparent;
  border: 0;
  border-radius: calc(var(--control-radius) - 2px);
  cursor: pointer;
}

.scm-more-btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.scm-more-menu {
  position: absolute;
  z-index: 30; /* matches the existing in-panel dropdown convention */
  top: calc(var(--control-h-sm) + 4px);
  right: 0;
  min-width: 190px;
  padding: var(--space-2);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-modal);
}

/* Branch button on top, its verbs directly beneath it. */
.scm-branchbar {
  display: flex;
  flex-direction: column;
  gap: var(--panel-gap);
  padding: var(--space-2) var(--panel-gutter) 0;
}

.scm-syncrow {
  display: flex;
  gap: var(--space-2);
}

.scm-syncrow .scm-sync-btn {
  flex: 1 1 0;
  height: var(--control-h);
  font-size: var(--text-sm);
  border-radius: var(--control-radius);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run apps/desktop/renderer/src/SourceControlView.test.tsx`
Expected: PASS — pre-existing tests plus the 3 new ones. If an older test asserted on the `<select>` branch picker or the standing "New branch…" input, update it to the new markup; those elements are intentionally gone.

- [ ] **Step 9: Check the file-size limit**

Run: `npx wc -l apps/desktop/renderer/src/SourceControlView.tsx`
Expected: under 500. If it is over, move the overflow menu into `BranchMenu.tsx` as a second exported component and import it.

- [ ] **Step 10: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/renderer/src/SourceControlView.tsx apps/desktop/renderer/src/SourceControlView.test.tsx apps/desktop/renderer/styles.css
git commit -m "feat(ui): one branch control, one primary commit action, PR in overflow"
```

---

### Task 7: Align the remaining Source Control rows

Brings the commit box, section headings, file rows, and stash rows onto the shared gutter and control sizes, so the panel finally has one left edge.

**Files:**
- Modify: `apps/desktop/renderer/styles.css`
- Modify: `apps/desktop/renderer/src/SourceControlView.tsx` (empty state markup only)
- Test: `apps/desktop/renderer/src/SourceControlView.test.tsx` (append one case)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: no new exported API. The empty state renders text `No changes` inside an element with class `scm-empty`.

- [ ] **Step 1: Write the failing test**

Append to the `Source Control header` describe in `SourceControlView.test.tsx`:

```tsx
  it('gives a clean tree a real empty state', async () => {
    status.mockResolvedValue({ isRepo: true, branch: 'main', files: [], root: '/r' });
    const { container } = render(<SourceControlView rootPath="/r" onOpenDiff={vi.fn()} />);
    await screen.findByRole('button', { name: 'Branch: main' });
    const empty = container.querySelector('.scm-empty');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent('No changes');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/SourceControlView.test.tsx -t "real empty state"`
Expected: FAIL — `.scm-empty` is null (it currently renders `<p className="muted">No changes.</p>`).

- [ ] **Step 3: Replace the empty state**

In `SourceControlView.tsx`, replace:

```tsx
      {status.files.length === 0 && <p className="muted">No changes.</p>}
```

with:

```tsx
      {status.files.length === 0 && (
        <div className="scm-empty">
          <span className="scm-empty-mark" aria-hidden>
            ✓
          </span>
          <span>No changes</span>
          <span className="scm-empty-hint">Your working tree is clean.</span>
        </div>
      )}
```

- [ ] **Step 4: Align the rest of the panel**

Append to `apps/desktop/renderer/styles.css`:

```css
/* --- Source Control body: one gutter, one control height ---------------- */
.scm-commit {
  gap: var(--panel-gap);
  padding: var(--panel-gap) var(--panel-gutter);
}

.scm-message {
  font-size: var(--text-sm);
  border-radius: var(--control-radius);
}

.scm-commit-btn {
  height: var(--control-h);
  font-size: var(--text-sm);
  border-radius: var(--control-radius);
}

.scm-group-head {
  padding: var(--space-3) var(--panel-gutter) var(--space-1);
}

.scm-line .scm-row,
.scm-stash-row {
  min-height: var(--control-h);
}

.scm-line .scm-row {
  padding-left: var(--panel-gutter);
  font-size: var(--text-sm);
  border-radius: var(--control-radius);
}

.scm-stash-row {
  padding: var(--space-2) var(--panel-gutter);
}

.scm-stash-msg {
  font-size: var(--text-sm);
}

.scm-stash-btn {
  height: var(--control-h-sm);
  font-size: var(--text-xs);
}

/* Clean tree deserves a real state, not a bare left-aligned line. */
.scm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--section-gap) var(--panel-gutter);
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-align: center;
}

.scm-empty-mark {
  font-size: var(--text-lg);
  color: var(--accent);
}

.scm-empty-hint {
  font-size: var(--text-xs);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/desktop/renderer/src/SourceControlView.test.tsx`
Expected: PASS

- [ ] **Step 6: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm test && npm run security`
Expected: all green, security scan clean.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/src/SourceControlView.tsx apps/desktop/renderer/src/SourceControlView.test.tsx apps/desktop/renderer/styles.css
git commit -m "feat(ui): align Source Control on the shared gutter and control sizes"
```

---

### Task 8: Verify visually and ship

Automated tests cannot tell you whether this looks right. This task is the visual gate.

**Files:**
- Modify: `PROGRESS.md`
- Modify: `package.json`, `apps/desktop/package.json` (version bump)

**Interfaces:**
- Consumes: everything above.
- Produces: a packaged installer and a published feed entry.

- [ ] **Step 1: Build and look at it**

```bash
npm run package:m1:selfhost
```

Install the produced `apps/desktop/release/m1/Strix M1 Setup <version>.exe` and check, in this order:

1. AI panel — the mode control sits under the input, labels are readable, the thumb slides, and switching to Accept edits tints the composer.
2. Source Control — one branch button, menu lists branches and offers "New branch…", one amber Commit button, Create PR under `⋯`, everything shares one left edge.
3. Toggle Settings → theme **light**, then **dark**. Both must stay legible.
4. Toggle Settings → density **compact**. Nothing may overlap or clip.
5. Narrow the AI panel until the segmented labels drop to icons — it must not overflow.

- [ ] **Step 2: Update PROGRESS.md**

Add a session section at the top of the numbered updates in `PROGRESS.md` describing the token foundation, the composer mode control, and the Source Control rebuild, and bump the `Last updated` line to the new version.

- [ ] **Step 3: Bump the version**

```bash
node -e "for(const f of ['package.json','apps/desktop/package.json']){const p=require('./'+f);p.version='0.2.14';require('fs').writeFileSync(f,JSON.stringify(p,null,4)+'\n');}"
```

- [ ] **Step 4: Ship it**

```bash
npm run update:ship:selfhost
```

- [ ] **Step 5: Commit**

```bash
git add PROGRESS.md package.json apps/desktop/package.json
git commit -m "chore(release): 0.2.14 (UI slice 1 — design language, Source Control, AI composer)"
```

---

## Done when

- All eight tasks committed, full suite green, security scan clean.
- The AI mode control is legible and sits beside Send.
- Source Control reads branch → message → Commit, with one primary button and one left edge.
- No text below 11px anywhere in either panel.
- A build has been installed and visually checked in both themes and both densities.
