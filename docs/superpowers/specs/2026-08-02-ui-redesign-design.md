# Strix UI — design language, Source Control, AI composer

Date: 2026-08-02 · Status: approved, ready for planning · Slice 1 of a multi-slice UI effort

## Problem

Two complaints, one root cause.

- **Source Control looks bad.** Eight blocks stacked at identical visual weight (branch bar,
  new-branch input, commit message, Commit, Create PR, changes list, Stashes, History). Nothing
  reads as primary, so the panel has no entry point. A permanently visible "New branch…" field
  occupies a row for a rare action. Two full-width buttons compete, so neither reads as *the*
  action. Horizontal gutters disagree (6px in some rows, 8px in others), so nothing shares a left
  edge.
- **The AI mode selector (Manual / Accept edits / Plan) is not findable.** It renders at
  `--text-2xs` (9px) with `2px 9px` padding and is pushed by `margin-left:auto` into the far corner
  of a row that already carries a model `<select>` and a routing chip. It is the smallest element in
  the busiest row — and it decides whether the AI writes to the user's files. Highest consequence,
  lowest visibility.

The shared cause: the UI is built on a scale tuned for **density**, not comfort. UI labels bottom out
at 9–11px, controls carry 2px padding, radii are 4px. The result reads cramped because it is
**undersized**, not because it is ugly.

## Goals

1. Establish an Apple-flavoured design language as **tokens**, so later surfaces inherit it instead
   of each being hand-tuned.
2. Apply it to the two surfaces the user named: Source Control and the AI composer.
3. Make agent mode obvious and comfortable to reach.

## Non-goals

- Redesigning the explorer, tabs, terminal, settings, command palette, dialogs, or status bar.
  Those are later slices that consume the same tokens.
- Replacing the amber brand. Amber is committed identity (status-bar stripe, selection wash) and is
  preserved.
- Glass/translucency as a general surface treatment. Materials stay confined to chrome overlays
  (command palette, menus, dialogs) and never sit behind code or panel text.
- Any change to git behaviour, AI routing, or the updater.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Scope | Design language first, then the two panels | Later surfaces inherit it; makes "pay attention to UI" an enforceable written standard |
| Apple flavour | macOS-native; materials on chrome only | Heavy translucency behind code hurts legibility and is a known generated-UI tell |
| Accent | Keep amber | Identity preservation beats house style; a neutral repaint would make Strix generic |
| Mode placement | In the composer, under the input | The decision is made while typing the request; also decongests the toolbar row |
| Token strategy | Additive control tokens, not a retune of `--space-*` | Untouched surfaces cannot shift; keeps regression risk bounded |

## Design

### 1. Design language (tokens)

New control-level semantic tokens in `apps/desktop/renderer/tokens.css`. These are additive: the
existing `--space-*` and `--radius-*` scales keep their values, so surfaces outside this slice are
unaffected.

```css
--control-h:      28px;  /* buttons, selects, segmented controls — one height */
--control-h-sm:   22px;  /* inline row actions (stash Pop/Apply/Drop) */
--control-radius:  7px;  /* was 4px */
--card-radius:    10px;
--field-h:        28px;  /* text inputs match button height */
--panel-gutter:   12px;  /* ONE horizontal gutter for all panel content */
--panel-gap:       8px;  /* vertical rhythm between blocks */
--section-gap:    16px;  /* between major sections */
```

`--panel-gutter` is the fix for the mixed 6px/8px insets: every direct child of a panel uses it, so
the panel has one left edge.

Type scale:

| Token | Before | After | Used for |
|---|---|---|---|
| `--text-2xs` | 9px | **10px** | badges and counts only — never a label |
| `--text-xs` | 11px | 11px | secondary metadata |
| `--text-sm` | 12px | 12px | dense labels (already exists) |
| `--text-base` | 13px | 13px | default UI text (already exists) |

The scale is already adequate — `--text-sm` and `--text-base` exist and are simply not used by the
panels in this slice, which reach for `--text-2xs`/`--text-xs` instead. The work is therefore mostly
**applying the right existing step**, plus nudging `--text-2xs` off 9px.

Rule: 9px is no longer used for anything the user is meant to read.

Interaction and motion:

- Quiet fills on hover, using the **existing** `--bg-hover` (and `--overlay-subtle` for chips) rather
  than new rgba literals — a parallel set of hover values would recreate the drift this slice exists
  to remove. Borders do not appear on hover (that shift is what makes a UI feel jumpy).
- Focus keeps the existing blue `--focus` token, rendered as a soft 3px ring.
- Transitions 150–200ms ease-out, limited to opacity and transform, with a
  `prefers-reduced-motion: reduce` branch.
- The existing `density: compact` setting continues to tighten spacing for users who want more on
  screen. It is implemented as a `:root[data-density='compact']` block that **redefines the control
  tokens themselves** (`--control-h: 24px`, `--panel-gutter: 10px`, …), so every surface built on
  them shrinks together rather than each needing its own per-component override.

### 2. Source Control (`SourceControlView.tsx`, `StashList.tsx`)

Reading order becomes **branch → message → Commit**, matching the actual workflow.

- **Branch becomes one control.** A `--control-h` button showing the current branch. Clicking opens
  a menu listing local branches plus a "New branch…" item that prompts inline. This removes the
  always-visible new-branch row entirely.
- **Sync actions demote** to a grouped row of icon buttons (Pull / Push / Sync) directly under the
  branch button, since they are verbs acting on that branch.
- **One primary button.** `Commit on <branch>` is the only amber-filled control in the panel.
  **Create Pull Request moves into an overflow menu**, opened by a new `⋯` button added to the
  panel header (the header currently has no actions).
- **Consistent sections.** Changes / Staged / Stashes / History share one header treatment, the
  `--panel-gutter`, and `--control-h` rows with quiet hover fills.
- **Real empty state** for "No changes" instead of a bare left-aligned line.
- Stash rows keep their current structure (message lead, `⎇ branch · age` metadata, hover-revealed
  actions) and adopt `--control-h-sm` for the action buttons.

### 3. AI panel (`AiPanel.tsx`)

- **Toolbar row** keeps only the model picker and the routed-model chip. The mode control leaves it.
- **Composer** gains a control row beneath the textarea: the segmented mode control on the left,
  attach and Send on the right.
- **Segmented control**: `--control-h` tall, `--text-sm` labels, one icon per mode, pill radius,
  amber fill on the active segment, and a sliding indicator animated with `transform` only. Icons
  are **SVG components added to `renderer/src/icons.tsx`** (pencil = propose, check = auto-apply,
  clock/outline = plan-only), matching the existing icon system — not unicode glyphs, which render
  inconsistently across fonts and would break the system look.
- **Ambient consequence signal**: in Accept-edits mode the composer border takes a subtle amber
  tint, so "the AI will write to my files" is visible without being read.
- **Copy fix**: the empty state says "pick a mode above"; it becomes "below".
- **Keyboard**: the control stays a `radiogroup` with arrow-key navigation and visible focus rings.

## Components touched

| File | Change |
|---|---|
| `renderer/tokens.css` | Add control tokens; retune `--text-2xs`; add `--text-sm`, `--text-base` |
| `renderer/styles.css` | Restyle `.scm-*` and `.ai-mode*`; add segmented-control and branch-menu styles |
| `renderer/src/SourceControlView.tsx` | Branch menu, overflow menu, section structure, empty state |
| `renderer/src/StashList.tsx` | Adopt `--control-h-sm` for row actions |
| `renderer/src/AiPanel.tsx` | Move mode control into the composer; add icons and ambient state |
| `renderer/src/icons.tsx` | Add three mode icons (propose / auto-apply / plan-only) |
| `renderer/src/BranchMenu.tsx` | New — branch picker + "New branch…", extracted to respect the file-size limit |

`SourceControlView.tsx` is currently 491 lines against a 500-line project limit. The branch menu and
overflow menu are extracted into a separate component (`BranchMenu.tsx`) rather than inlined, which
keeps the file under the limit and gives each piece one purpose.

## Testing

- Existing suites must stay green (463 tests at time of writing).
- New: branch menu opens, lists branches, triggers checkout, and offers "New branch…".
- New: mode selector renders all three modes, reflects the active one via `aria-checked`, and
  changes mode on click and on arrow keys.
- New: Create PR is reachable from the overflow menu.
- Manual: package a build and confirm both panels visually, in dark and light themes, at both
  density settings.

## Risks

- `styles.css` is ~4,938 lines. Mitigated by adding tokens rather than re-tuning existing scales, so
  surfaces outside this slice cannot shift.
- Moving Create PR into an overflow menu makes a previously one-click action two clicks. Accepted:
  committing is far more frequent, and two equal-weight buttons meant neither read as primary.
- Larger controls show less content per screen. Mitigated by the existing `density: compact` setting.

## Later slices

Explorer and tabs · terminal · settings · command palette and dialogs · status bar. Each consumes
the tokens defined here; none should introduce new ad-hoc sizing.
