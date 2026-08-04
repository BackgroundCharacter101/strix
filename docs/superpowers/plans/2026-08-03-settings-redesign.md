# Strix Settings Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Settings panel look and behave like the rest of Strix, use the window, tell the truth about saving, and give every one of the 102 settings a reachable path via a raw `settings.json` view.

**Architecture:** Slice 2 of the UI effort — consumes the control tokens added in slice 1 (`--control-h`, `--control-radius`, `--field-h`, `--panel-gutter`, `--panel-gap`, `--section-gap`). The 1,209-line `SettingsPage.tsx` splits into a shell plus three focused files. The JSON view is a *derived* view of settings state, never a second source of truth.

**Tech Stack:** React 19, TypeScript 5 (strict), plain CSS custom properties, Monaco (already a dependency), Vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-08-03-settings-redesign-design.md`

## Global Constraints

- Consume the existing slice-1 tokens. Do NOT invent new token names and do NOT hardcode pixels where a token exists (`--control-h: 28px`, `--control-h-sm: 22px`, `--control-radius: 7px`, `--card-radius: 10px`, `--field-h: 28px`, `--panel-gutter: 12px`, `--panel-gap: 8px`, `--section-gap: 16px`).
- Amber (`--accent`) is the active/on colour. Do not substitute another colour.
- No text below `--text-xs` (11px). `--text-2xs` is for badges and counts only.
- Animate only `opacity` and `transform`, each with a `@media (prefers-reduced-motion: reduce)` branch.
- No `backdrop-filter` in the settings content area.
- **Every file must end under 500 lines**, including `SettingsPage.tsx`.
- **Do not add new settings keys.** The 102 in `useSettings.ts` are the scope; this is about reaching them.
- **Do not remove any existing setting** while splitting the file. Count the controls before and after.
- No `Co-Authored-By` trailer in commits.
- Renderer tests need `// @vitest-environment jsdom` as line 1 and `import '@testing-library/jest-dom/vitest'`. Use `fireEvent` from `@testing-library/react` — `@testing-library/user-event` is NOT a dependency.
- Run `npm run typecheck && npm run lint && npm test` before each commit.

---

### Task 1: Toggle, and the rest of the control primitives

**Files:**
- Create: `apps/desktop/renderer/src/SettingsControls.tsx`
- Test: `apps/desktop/renderer/src/SettingsControls.test.tsx` (create)
- Modify: `apps/desktop/renderer/styles.css` (append)

**Interfaces:**
- Consumes: slice-1 tokens.
- Produces — later tasks import exactly these:
  ```ts
  export function Toggle(p: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }): JSX.Element
  export function SettingRow(p: { label: string; description?: string; htmlFor?: string; children: React.ReactNode }): JSX.Element
  ```
  `Toggle` renders `role="switch"` with `aria-checked` and an accessible name equal to `label`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/renderer/src/SettingsControls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toggle, SettingRow } from './SettingsControls';

describe('Toggle', () => {
  it('is a switch carrying its label as the accessible name', () => {
    render(<Toggle checked={false} onChange={vi.fn()} label="Reduce motion" />);
    const sw = screen.getByRole('switch', { name: 'Reduce motion' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('reports the new value on click', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Reduce motion" />);
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles off again when already on', () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} label="Liquid Glass" />);
    expect(screen.getByRole('switch', { name: 'Liquid Glass' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('switch', { name: 'Liquid Glass' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does not fire while disabled', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Reduce motion" disabled />);
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is not a native checkbox', () => {
    // The old panel used raw <input type="checkbox">, which renders as a blue
    // Windows control inside a near-black amber IDE.
    const { container } = render(<Toggle checked onChange={vi.fn()} label="X" />);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });
});

describe('SettingRow', () => {
  it('shows the label and description beside its control', () => {
    render(
      <SettingRow label="Color theme" description="Overall UI theme.">
        <button type="button">control</button>
      </SettingRow>,
    );
    expect(screen.getByText('Color theme')).toBeInTheDocument();
    expect(screen.getByText('Overall UI theme.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'control' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/SettingsControls.test.tsx`
Expected: FAIL — cannot resolve `./SettingsControls`.

- [ ] **Step 3: Write the component**

Create `apps/desktop/renderer/src/SettingsControls.tsx`:

```tsx
import React from 'react';

// A switch, not an <input type="checkbox">. The native control renders as a
// blue Windows box inside a near-black amber IDE, which is why the old panel
// looked borrowed from another app.
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`set-toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="set-toggle-knob" aria-hidden />
    </button>
  );
}

// One row: label + description on the left, control right-aligned.
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        {htmlFor ? (
          <label className="set-row-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="set-row-label">{label}</span>
        )}
        {description && <span className="set-row-desc">{description}</span>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Add the CSS**

Append to `apps/desktop/renderer/styles.css`:

```css
/* --- Settings controls --------------------------------------------------- */
.set-toggle {
  position: relative;
  flex: 0 0 auto;
  width: 40px;
  height: 22px;
  padding: 0;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  transition: background 150ms ease-out;
}

.set-toggle.is-on {
  background: var(--accent);
  border-color: var(--accent);
}

.set-toggle:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.set-toggle[disabled] {
  cursor: default;
  opacity: 0.5;
}

.set-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: var(--text);
  border-radius: 50%;
  transition: transform 150ms ease-out;
}

.set-toggle.is-on .set-toggle-knob {
  background: var(--accent-ink);
  transform: translateX(18px);
}

@media (prefers-reduced-motion: reduce) {
  .set-toggle,
  .set-toggle-knob {
    transition: none;
  }
}

.set-row {
  display: flex;
  align-items: center;
  gap: var(--section-gap);
  padding: var(--panel-gap) 0;
}

.set-row + .set-row {
  border-top: 1px solid var(--border);
}

.set-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.set-row-label {
  font-size: var(--text-base);
  color: var(--text);
}

.set-row-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.set-row-control {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.set-row-control select,
.set-row-control input[type='text'],
.set-row-control input[type='number'] {
  height: var(--field-h);
  min-width: 200px;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
}

.set-row-control input[type='number'] {
  min-width: 90px;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run apps/desktop/renderer/src/SettingsControls.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/src/SettingsControls.tsx apps/desktop/renderer/src/SettingsControls.test.tsx apps/desktop/renderer/styles.css
git commit -m "feat(settings): add Toggle and SettingRow primitives on the control tokens"
```

---

### Task 2: Auto-save honestly, and confirm the destructive reset

Settings already persist on every change (`useSettings.ts:191-193`). The Save button calls
`onSave={() => updateSettings({})}` — a merge of an empty object, i.e. nothing. Remove the lie.

**Files:**
- Modify: `apps/desktop/renderer/src/SettingsPage.tsx` (header actions; drop `onSave`)
- Modify: `apps/desktop/renderer/App.tsx` (stop passing `onSave`)
- Test: `apps/desktop/renderer/src/SettingsPage.test.tsx` (append; create if absent)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SettingsPage` no longer accepts an `onSave` prop. Header exposes buttons named `Close` and `Reset to defaults`; reset requires a second confirming click named `Reset everything`.

- [ ] **Step 1: Write the failing test**

Append to `apps/desktop/renderer/src/SettingsPage.test.tsx` (if the file does not exist, create it with the jsdom pragma and the same `makeStrixApi` setup the other renderer tests use):

```tsx
describe('saving', () => {
  it('has no Save button, because settings persist as they change', () => {
    renderSettings();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
  });

  it('applies a change immediately', () => {
    const onChange = vi.fn();
    renderSettings({ onChange });
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    expect(onChange).toHaveBeenCalled();
  });

  it('requires confirmation before resetting every setting', () => {
    const onReset = vi.fn();
    renderSettings({ onReset });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset everything' }));
    expect(onReset).toHaveBeenCalled();
  });
});
```

Define `renderSettings(overrides)` at the top of the file as a helper that renders `<SettingsPage>`
with `settings={DEFAULT_SETTINGS}` and stub callbacks, merging `overrides`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/SettingsPage.test.tsx -t "saving"`
Expected: FAIL — a Save button is present and reset fires without confirmation.

- [ ] **Step 3: Remove Save and confirm Reset**

In `SettingsPage.tsx`: delete the Save button and the `onSave` prop (and its type), rename the `Done`
button's label to `Close`, and gate reset behind a confirmation:

```tsx
  const [confirmingReset, setConfirmingReset] = useState(false);
```

```tsx
        {confirmingReset ? (
          <>
            <button
              type="button"
              className="set-btn set-btn-danger"
              onClick={() => {
                setConfirmingReset(false);
                onReset?.();
              }}
            >
              Reset everything
            </button>
            <button type="button" className="set-btn" onClick={() => setConfirmingReset(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="set-btn" onClick={() => setConfirmingReset(true)}>
            Reset to defaults
          </button>
        )}
```

Keep whatever prop the existing code already uses for resetting; if it is named differently from
`onReset`, use the existing name in both the component and the test.

- [ ] **Step 4: Stop passing onSave**

In `App.tsx` (~line 1342) remove the `onSave={() => updateSettings({})}` line from `<SettingsPage>`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run apps/desktop/renderer/src/SettingsPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/src/SettingsPage.tsx apps/desktop/renderer/src/SettingsPage.test.tsx apps/desktop/renderer/App.tsx
git commit -m "fix(settings): drop the Save button that did nothing; confirm destructive reset"
```

---

### Task 3: Layout that uses the window

**Files:**
- Modify: `apps/desktop/renderer/styles.css` (`.settings-*` rules)
- Modify: `apps/desktop/renderer/src/SettingsPage.tsx` (section icons in the nav)

**Interfaces:**
- Consumes: slice-1 tokens; `SettingRow` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Replace the layout CSS**

In `apps/desktop/renderer/styles.css`, update the settings layout so the content column fills the
window and is capped at a readable measure. Replace the existing `.settings-main` / `.settings-body`
rules with:

```css
.settings-main {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.settings-nav {
  flex: 0 0 200px;
  padding: var(--panel-gap) var(--space-2);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  height: var(--control-h);
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--control-radius);
  cursor: pointer;
  text-align: left;
}

.settings-nav-item:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.settings-nav-item[aria-current='true'] {
  background: var(--bg-hover);
  color: var(--text);
}

/* The content column: fills the pane, but capped so label/control pairs never
   stretch across a 2000px window. Centring removes the old top-left void. */
.settings-body {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  padding: var(--section-gap) var(--section-gap) 64px;
}

.settings-col {
  max-width: 720px;
  margin: 0 auto;
}

.set-section-title {
  font-size: var(--text-2xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: var(--section-gap) 0 var(--space-2);
}
```

Remove the card-like `background`/`border` on the old settings body block if one is present, so the
content is a plain column rather than a floating card.

- [ ] **Step 2: Wrap the section content in the column**

In `SettingsPage.tsx`, wrap the rendered section content in `<div className="settings-col">…</div>`
inside `.settings-body`.

- [ ] **Step 3: Add icons to the nav**

Give each entry in `SECTIONS` (declared around line 337) an `Icon` field using icons that already
exist in `./icons`, and render `<Icon size={14} />` before the label in the nav button. Also set
`aria-current={active ? 'true' : undefined}` on the active nav item so the CSS above applies and the
state is exposed to assistive tech. If a suitable icon does not exist for a section, use the closest
existing one rather than inventing new SVGs in this task.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/src/SettingsPage.tsx apps/desktop/renderer/styles.css
git commit -m "feat(settings): fill the window with a centred, readable content column"
```

---

### Task 4: Convert every checkbox to a Toggle

**Files:**
- Modify: `apps/desktop/renderer/src/SettingsPage.tsx`
- Test: `apps/desktop/renderer/src/SettingsPage.test.tsx` (append)

**Interfaces:**
- Consumes: `Toggle` and `SettingRow` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Count what must be converted**

Run: `npx grep -c "type=\"checkbox\"" apps/desktop/renderer/src/SettingsPage.tsx`
Expected: 16. Write that number down; it is the number of Toggles you must end up with.

- [ ] **Step 2: Write the failing test**

Append to `apps/desktop/renderer/src/SettingsPage.test.tsx`:

```tsx
it('uses switches, not native checkboxes, for every boolean setting', () => {
  const { container } = renderSettings();
  expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(5);
});
```

(The Appearance section alone renders several; the assertion stays loose because the visible count
depends on the active section.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/SettingsPage.test.tsx -t "native checkboxes"`
Expected: FAIL — native checkboxes are present.

- [ ] **Step 4: Convert each one**

Replace every `<input type="checkbox" checked={settings.X} onChange={(e) => onChange({ X: e.target.checked })} />`
with:

```tsx
<Toggle
  checked={settings.X}
  onChange={(v) => onChange({ X: v })}
  label="<the row's visible label>"
/>
```

Import `Toggle` from `./SettingsControls`. The `label` must match the row's visible label text so the
switch has a meaningful accessible name. Convert all 16; do not leave a mix.

- [ ] **Step 5: Verify the count**

Run: `npx grep -c "type=\"checkbox\"" apps/desktop/renderer/src/SettingsPage.tsx`
Expected: 0.

- [ ] **Step 6: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/src/SettingsPage.tsx apps/desktop/renderer/src/SettingsPage.test.tsx
git commit -m "feat(settings): replace all 16 native checkboxes with switches"
```

---

### Task 5: The settings.json view

**Files:**
- Create: `apps/desktop/renderer/src/SettingsJson.tsx`
- Test: `apps/desktop/renderer/src/SettingsJson.test.tsx` (create)
- Modify: `apps/desktop/renderer/src/SettingsPage.tsx` (GUI/JSON switch in the header)
- Modify: `apps/desktop/renderer/styles.css` (append)

**Interfaces:**
- Consumes: `Settings` and `DEFAULT_SETTINGS` from `./useSettings`; `CodeEditor` from `@strix/editor`.
- Produces:
  ```ts
  export function SettingsJson(p: {
    settings: Settings;
    onApply: (patch: Partial<Settings>) => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/renderer/src/SettingsJson.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Monaco does not run under jsdom; stand in with a plain textarea that reports
// its value the same way, so this test covers OUR parse/validate/apply logic.
vi.mock('@strix/editor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="settings json" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
  languageForPath: () => 'json',
}));

import { SettingsJson } from './SettingsJson';
import { DEFAULT_SETTINGS } from './useSettings';

const editor = () => screen.getByLabelText('settings json');

describe('SettingsJson', () => {
  it('renders the current settings as JSON', () => {
    render(<SettingsJson settings={DEFAULT_SETTINGS} onApply={vi.fn()} />);
    expect((editor() as HTMLTextAreaElement).value).toContain('"fontSize"');
  });

  it('applies a valid edit', () => {
    const onApply = vi.fn();
    render(<SettingsJson settings={DEFAULT_SETTINGS} onApply={onApply} />);
    fireEvent.change(editor(), {
      target: { value: JSON.stringify({ ...DEFAULT_SETTINGS, fontSize: 18 }, null, 2) },
    });
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 18 }));
  });

  it('shows an error and applies nothing when the JSON is invalid', () => {
    const onApply = vi.fn();
    render(<SettingsJson settings={DEFAULT_SETTINGS} onApply={onApply} />);
    fireEvent.change(editor(), { target: { value: '{ "fontSize": ' } });
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('clears the error once the JSON parses again', () => {
    render(<SettingsJson settings={DEFAULT_SETTINGS} onApply={vi.fn()} />);
    fireEvent.change(editor(), { target: { value: '{ oops' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(editor(), { target: { value: '{}' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses a JSON top level that is not an object', () => {
    const onApply = vi.fn();
    render(<SettingsJson settings={DEFAULT_SETTINGS} onApply={onApply} />);
    fireEvent.change(editor(), { target: { value: '[1,2,3]' } });
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/SettingsJson.test.tsx`
Expected: FAIL — cannot resolve `./SettingsJson`.

- [ ] **Step 3: Write the component**

Create `apps/desktop/renderer/src/SettingsJson.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { CodeEditor } from '@strix/editor';
import type { Settings } from './useSettings';

// The JSON view is DERIVED from settings state, never a second source of truth:
// the GUI writes state, this renders from it, and an edit here must parse and
// validate before it is applied. Invalid JSON is reported and applied nowhere,
// so a half-typed brace can never wipe someone's configuration.
export function SettingsJson({
  settings,
  onApply,
}: {
  settings: Settings;
  onApply: (patch: Partial<Settings>) => void;
}) {
  const serialised = JSON.stringify(settings, null, 2);
  const [draft, setDraft] = useState(serialised);
  const [error, setError] = useState<string | null>(null);

  // Follow changes made in the GUI while this view is open, unless the user is
  // mid-edit with something that does not parse (clobbering that would be rude).
  useEffect(() => {
    if (!error) setDraft(serialised);
  }, [serialised]);

  const onChange = (text: string) => {
    setDraft(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Settings must be a JSON object.');
      return;
    }
    setError(null);
    onApply(parsed as Partial<Settings>);
  };

  return (
    <div className="settings-json">
      <p className="settings-json-hint">
        Every setting, as stored. Changes apply as soon as the JSON is valid.
      </p>
      <div className="settings-json-editor">
        <CodeEditor value={draft} language="json" onChange={onChange} />
      </div>
      {error && (
        <p className="settings-json-error" role="alert">
          {error} — nothing was applied.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the CSS**

Append to `apps/desktop/renderer/styles.css`:

```css
/* --- Settings JSON view -------------------------------------------------- */
.settings-json {
  display: flex;
  flex-direction: column;
  gap: var(--panel-gap);
  height: 100%;
  min-height: 0;
}

.settings-json-hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.settings-json-editor {
  flex: 1 1 auto;
  min-height: 320px;
  border: 1px solid var(--border);
  border-radius: var(--card-radius);
  overflow: hidden;
}

.settings-json-error {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--danger, #e5534b);
}
```

- [ ] **Step 5: Add the GUI / JSON switch**

In `SettingsPage.tsx`, add `const [view, setView] = useState<'gui' | 'json'>('gui');` and a pair of
header buttons (`GUI`, `JSON`) with `aria-pressed`. When `view === 'json'`, render
`<SettingsJson settings={settings} onApply={onChange} />` in place of the section content and hide
the section nav. Mount it only while selected, so a second Monaco instance is not created while the
GUI is showing.

- [ ] **Step 6: Run tests**

Run: `npx vitest run apps/desktop/renderer/src/SettingsJson.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 7: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/renderer/src/SettingsJson.tsx apps/desktop/renderer/src/SettingsJson.test.tsx apps/desktop/renderer/src/SettingsPage.tsx apps/desktop/renderer/styles.css
git commit -m "feat(settings): add a settings.json view backed by the GUI state"
```

---

### Task 6: Split SettingsPage under the line limit

**Files:**
- Create: `apps/desktop/renderer/src/SettingsProviders.tsx`
- Modify: `apps/desktop/renderer/src/SettingsPage.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `SettingsProviders` exporting the AI provider/key configuration UI that currently lives inside `SettingsPage.tsx`. Its props are whatever that block already closes over — pass them explicitly rather than re-deriving them.

- [ ] **Step 1: Record the starting size and control count**

```bash
npx wc -l apps/desktop/renderer/src/SettingsPage.tsx
npx grep -c "SettingRow\|<Toggle" apps/desktop/renderer/src/SettingsPage.tsx
```
Write both numbers down. The control count must not drop after the split — that would mean a setting was lost in the move.

- [ ] **Step 2: Move the AI provider blocks**

Cut the AI provider / API-key configuration components and their module-level constant lists (the
`PROVIDERS` / free-provider arrays near the top of the file) into `SettingsProviders.tsx`, export the
component, and import it back into `SettingsPage.tsx`. Move only provider UI — leave the generic
section plumbing in the page.

- [ ] **Step 3: Verify the size and the count**

```bash
npx wc -l apps/desktop/renderer/src/SettingsPage.tsx apps/desktop/renderer/src/SettingsProviders.tsx
npx grep -c "SettingRow\|<Toggle" apps/desktop/renderer/src/SettingsPage.tsx apps/desktop/renderer/src/SettingsProviders.tsx
```
Expected: every file under 500 lines, and the combined control count equal to the number recorded in
Step 1.

- [ ] **Step 4: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/src/SettingsPage.tsx apps/desktop/renderer/src/SettingsProviders.tsx
git commit -m "refactor(settings): extract the AI provider UI to keep every file under 500 lines"
```

---

### Task 7: Verify visually and ship

- [ ] **Step 1: Build**

```bash
npm run update:ship:selfhost
```

- [ ] **Step 2: Look at it**

Install the produced installer and check, in this order:

1. Settings fills the window — a centred column, no top-left void.
2. Every boolean is an amber switch; no blue native checkboxes anywhere.
3. No Save button. Change a setting, close Settings, reopen — the change is still there.
4. `Reset to defaults` asks before wiping.
5. The JSON view lists every setting; edit one value and watch the GUI follow; type a stray brace and
   confirm the error appears and nothing is applied.
6. Both themes, `density: compact`, and a narrow window.

- [ ] **Step 3: Update PROGRESS.md and bump the version, then ship**

```bash
npm run update:ship:selfhost
```

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md package.json apps/desktop/package.json
git commit -m "chore(release): settings redesign"
```

---

## Done when

- Settings uses the window, on the slice-1 tokens, with no native checkboxes.
- No Save button; reset is confirmed.
- `settings.json` reaches all 102 settings and cannot destroy them with invalid input.
- Every file under 500 lines, full suite green, and a build has been looked at.
