import { useCallback, useEffect, useState } from 'react';

export interface Settings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  theme: 'dark' | 'light';
}

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  minimap: false,
  theme: 'dark',
};

const KEY = 'strix.settings';

// Persisted user settings. Applies the theme to the document root so tokens.css
// can re-skin via [data-theme].
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as object) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  const update = useCallback(
    (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );

  return [settings, update];
}
