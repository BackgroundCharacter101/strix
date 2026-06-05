import { useSyncExternalStore } from 'react';

// Which file-icon set the Explorer/tabs use. Kept in a tiny module store (not
// React context) so the stateless FileIcon used in many places can subscribe
// without prop-threading. useSettings keeps this in sync with the saved setting.
export type IconTheme = 'material' | 'strix';

let current: IconTheme = 'material';
const listeners = new Set<() => void>();

export function getIconTheme(): IconTheme {
  return current;
}

export function setIconTheme(theme: IconTheme): void {
  if (theme !== current) {
    current = theme;
    for (const l of listeners) l();
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useIconTheme(): IconTheme {
  return useSyncExternalStore(subscribe, getIconTheme, getIconTheme);
}
