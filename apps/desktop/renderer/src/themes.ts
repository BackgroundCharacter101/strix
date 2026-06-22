// Theme + accent catalogues. The CSS lives in tokens.css as
// [data-theme='…'] / [data-accent='…'] blocks; these constants drive the
// Settings UI and the Monaco accent (which needs the raw hex).

export const THEMES = [
  { id: 'dark', label: 'Strix Dark' },
  { id: 'black', label: 'Black (OLED)' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'high-contrast', label: 'High Contrast' },
  { id: 'light', label: 'Light' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const ACCENTS = [
  { id: 'amber', label: 'Gold', hex: '#e8bd3a' },
  { id: 'violet', label: 'Violet', hex: '#7c5cff' },
  { id: 'teal', label: 'Teal', hex: '#1fb6a6' },
  { id: 'emerald', label: 'Emerald', hex: '#2ea36b' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'red', label: 'Red', hex: '#e5484d' },
  { id: 'white', label: 'White', hex: '#e8e8ec' },
] as const;

export type AccentId = (typeof ACCENTS)[number]['id'];

export function accentHex(id: string): string {
  return ACCENTS.find((a) => a.id === id)?.hex ?? '#e8bd3a';
}

// Light theme uses the 'vs'-based Monaco theme; the OLED-black theme gets its own
// pure-black editor; every other dark theme uses the shared 'strix-dark'.
export function monacoThemeFor(theme: string): 'strix-dark' | 'strix-light' | 'strix-black' {
  if (theme === 'light') return 'strix-light';
  if (theme === 'black') return 'strix-black';
  return 'strix-dark';
}
