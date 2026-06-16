// Remappable keyboard shortcuts. The App owns the actions; this module is the
// pure registry + accelerator (de)serialization so it's testable and the
// Settings UI and the keydown dispatcher share one source of truth.

export interface KeyCommand {
  id: string;
  label: string;
  // Default accelerator in canonical "Ctrl+Shift+P" form (Ctrl, then Shift,
  // then Alt, then the key). Cmd is treated as Ctrl for matching.
  defaultKey: string;
}

// Single-modifier Ctrl/Cmd shortcuts (the remappable set). Chords like Ctrl+K S
// are intentionally excluded.
export const KEY_COMMANDS: KeyCommand[] = [
  { id: 'save', label: 'Save file', defaultKey: 'Ctrl+S' },
  { id: 'toggleSidebar', label: 'Toggle sidebar', defaultKey: 'Ctrl+B' },
  { id: 'toggleTerminal', label: 'Toggle terminal', defaultKey: 'Ctrl+`' },
  { id: 'closeTab', label: 'Close editor', defaultKey: 'Ctrl+W' },
  { id: 'splitEditor', label: 'Split / cycle editor groups', defaultKey: 'Ctrl+\\' },
  { id: 'commandPalette', label: 'Command palette', defaultKey: 'Ctrl+Shift+P' },
  { id: 'quickOpen', label: 'Quick open file', defaultKey: 'Ctrl+P' },
  { id: 'openFile', label: 'Open file…', defaultKey: 'Ctrl+O' },
  { id: 'search', label: 'Search across files', defaultKey: 'Ctrl+Shift+F' },
];

export type KeybindingOverrides = Record<string, string>;

// Canonical accelerator string for a keyboard event. Ctrl/Cmd both → "Ctrl".
export function eventAccelerator(e: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  key: string;
}): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  let k = e.key;
  if (k === ' ') k = 'Space';
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join('+');
}

// The active accelerator for a command (user override or default).
export function resolveKey(id: string, overrides: KeybindingOverrides = {}): string {
  return overrides[id] || KEY_COMMANDS.find((c) => c.id === id)?.defaultKey || '';
}

// Build a lookup from accelerator → command id for fast dispatch.
export function buildKeymap(overrides: KeybindingOverrides = {}): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of KEY_COMMANDS) map.set(resolveKey(c.id, overrides), c.id);
  return map;
}
