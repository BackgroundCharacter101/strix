import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SECURITY_PERSONA, type SecurityStance, type SecurityPersona } from '@strix/ai-gateway';
import type { ThemeId, AccentId } from './themes';

export interface Settings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  theme: ThemeId;
  accent: AccentId;
  fontFamily: string;
  lineNumbers: 'on' | 'off' | 'relative';
  cursorStyle: 'line' | 'block' | 'underline';
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'all';
  // Shared FreeLLMAPI host, e.g. http://192.168.1.50:3001 (blank = local).
  aiServerUrl: string;
  // Workbench mode: 'normal' (clean coding) or 'cybersec' (pentester vibe +
  // security-expert AI persona).
  mode: 'normal' | 'cybersec';
  // In Cybersec mode, tunes the AI security persona.
  securityStance: SecurityStance;
  // Editable security-persona instructions (base + per-stance). Defaults to the
  // built-in DEFAULT_SECURITY_PERSONA; user-customizable in Settings.
  securityPersona: SecurityPersona;
}

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  minimap: false,
  theme: 'dark',
  accent: 'amber',
  fontFamily: '',
  lineNumbers: 'on',
  cursorStyle: 'line',
  renderWhitespace: 'selection',
  aiServerUrl: '',
  mode: 'normal',
  securityStance: 'balanced',
  securityPersona: { ...DEFAULT_SECURITY_PERSONA },
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
    document.documentElement.dataset.accent = settings.accent;
    document.documentElement.dataset.mode = settings.mode;
  }, [settings]);

  const update = useCallback(
    (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );

  return [settings, update];
}
