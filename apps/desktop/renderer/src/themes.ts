// Theme + accent catalogues. The CSS lives in tokens.css as
// [data-theme='…'] / [data-accent='…'] blocks; these constants drive the
// Settings UI and the Monaco accent (which needs the raw hex).

export const THEMES = [
  { id: 'dark', label: 'Strix Dark' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'high-contrast', label: 'High Contrast' },
  { id: 'light', label: 'Light' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const ACCENTS = [
  { id: 'amber', label: 'Amber', hex: '#e8a33d' },
  { id: 'violet', label: 'Violet', hex: '#7c5cff' },
  { id: 'teal', label: 'Teal', hex: '#1fb6a6' },
  { id: 'emerald', label: 'Emerald', hex: '#2ea36b' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
] as const;

export type AccentId = (typeof ACCENTS)[number]['id'];

export function accentHex(id: string): string {
  return ACCENTS.find((a) => a.id === id)?.hex ?? '#e8a33d';
}

// Light theme uses the 'vs'-based Monaco theme; every dark theme uses 'vs-dark'.
export function monacoThemeFor(theme: string): 'strix-dark' | 'strix-light' {
  return theme === 'light' ? 'strix-light' : 'strix-dark';
}
