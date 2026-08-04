# Strix Settings — redesign

Date: 2026-08-03 · Status: approved, ready for planning · Slice 2 of the UI effort

## Problem

The Settings panel does not look or behave like the rest of the IDE, and 102 settings are
effectively unfindable.

- **The window is mostly void.** Content sits in a narrow card pinned to the top-left; on a wide
  window roughly 80% of the surface is empty black.
- **Controls are off-system.** 16 raw `<input type="checkbox">` render as native Windows checkboxes
  (blue, tiny) inside an amber-on-near-black IDE. Selects, number fields and text inputs are three
  different heights and radii.
- **The Save button does nothing.** `useSettings.ts:191-193` already persists to localStorage on
  every change, and `App.tsx:1342` passes `onSave={() => updateSettings({})}` — a merge of an empty
  object. The button is decorative, and it trains the user to believe unsaved changes exist.
- **`SettingsPage.tsx` is 1,209 lines**, 2.4× the project's 500-line limit.
- **102 settings, 5 sections, no escape hatch.** Anything the GUI does not surface is unreachable.

## Goals

1. Make Settings look like the rest of Strix, on the slice-1 control tokens.
2. Use the window: content readable and centred, not pinned into a corner.
3. Tell the truth about saving.
4. Give every setting a reachable path, via a raw `settings.json` view.
5. Get the file under the size limit.

## Non-goals

Chosen explicitly by the user; do not build these:

- Import / export of settings.
- A "modified only" filter or per-row reset-to-default.
- A keybinding editor (the Keyboard section keeps its current contents).
- Adding new *settings*. The 102 that exist are enough; this is about reaching them.

## Design

### 1. Layout

Two panes. A sidebar carries the section list (each with an icon) and the existing search field. The
content pane fills the remaining width, with its column capped at a readable measure (~720px) and
centred, so label/control pairs never stretch across a 2000px window and the void disappears.

Sections stay: Appearance · Editor · Terminal · Keyboard · AI.

### 2. Controls

- All 16 checkboxes become **toggle switches** built on the slice-1 tokens: `--control-h` for the
  row, `--control-radius`, amber (`--accent`) when on, `--focus` ring on keyboard focus.
- Selects, number fields and text inputs unify on `--field-h` and `--control-radius`.
- Each row is label + description on the left, control right-aligned, on the shared `--panel-gutter`.

### 3. Saving

Settings already persist on change, so the honest UI is auto-save:

- **Remove the Save button** and the dead `onSave` prop.
- `Done` becomes `Close`.
- **`Reset to defaults` gains a confirmation step.** It becomes the only destructive action in the
  panel, and one misclick currently discards all 102 settings with no undo.

### 4. `settings.json` view

A GUI / JSON switch in the header swaps the content pane for a Monaco editor holding the settings as
JSON.

**JSON is a derived view, not a second source of truth.** The GUI writes state; the JSON view renders
from that state. Editing JSON parses and validates, and only then writes back. Invalid JSON shows an
inline error and applies nothing — it is never silently discarded, and a typo can never wipe settings.
This is the main risk in the feature, so it is settled by direction of data flow rather than by
merge logic.

### 5. File structure

`SettingsPage.tsx` (1,209 lines) splits into:

| File | Responsibility |
|---|---|
| `SettingsPage.tsx` | shell: nav, search, GUI/JSON switch, section routing |
| `SettingsControls.tsx` | Toggle / Select / NumberField / TextField primitives |
| `SettingsJson.tsx` | the Monaco JSON view, parse/validate/apply |
| `SettingsProviders.tsx` | the existing AI provider/key configuration blocks |

Every new file stays under 500 lines; `SettingsPage.tsx` must end under 500.

## Testing

- Existing suites stay green (501 at time of writing).
- Toggle: renders as a `role="switch"` with correct `aria-checked`, flips on click and on Space/Enter.
- Auto-save: changing a control calls `onChange` immediately; no Save button exists in the DOM.
- Reset: requires confirmation before defaults are applied.
- JSON view: valid edit applies to settings; invalid JSON surfaces an error and leaves settings
  untouched; the view re-renders when the GUI changes a value.
- Manual: both themes, `density: compact`, and a narrow window.

## Risks

- Monaco is already a dependency (the editor), so the JSON view adds no new dependency, but it does
  add a second Monaco instance — mount it only while the JSON view is open.
- Splitting a 1,209-line file risks losing a setting during the move. The section list and control
  count are checked before and after.
