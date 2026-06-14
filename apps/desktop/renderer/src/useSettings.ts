import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SECURITY_PERSONA, type SecurityStance, type SecurityPersona } from '@strix/ai-gateway';
import type { ThemeId, AccentId } from './themes';
import { setIconTheme, type IconTheme } from './iconTheme';

export interface Settings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  theme: ThemeId;
  accent: AccentId;
  // File-icon set used in the Explorer/tabs ('material' colourful or 'strix').
  iconTheme: IconTheme;
  fontFamily: string;
  lineNumbers: 'on' | 'off' | 'relative';
  cursorStyle: 'line' | 'block' | 'underline';
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'all';
  // Line height as a multiplier of the font size (1.0–2.5).
  lineHeight: number;
  fontLigatures: boolean;
  smoothScrolling: boolean;
  stickyScroll: boolean;
  bracketColorization: boolean;
  scrollBeyondLastLine: boolean;
  // UI density: 'comfortable' (default) or 'compact' (tighter list rows/tabs).
  density: 'comfortable' | 'compact';
  // Disable non-essential UI animations (accessibility / low-power).
  reduceMotion: boolean;
  // Liquid Glass: frosted translucent blur on floating surfaces + side panels.
  liquidGlass: boolean;
  // Format the document with the language formatter on every save.
  formatOnSave: boolean;
  // Auto-save: periodically write dirty buffers. autoSaveSeconds is the interval.
  autoSave: boolean;
  autoSaveSeconds: number;
  // Shared FreeLLMAPI host, e.g. http://192.168.1.50:3001 (blank = local).
  aiServerUrl: string;
  // Reopen the most-recently-used folder (and its tabs) automatically on launch
  // instead of showing the welcome screen.
  restoreLastFolder: boolean;
  // Agent: apply file changes immediately, skipping the review/confirm modal.
  agentAutoApply: boolean;
  // FreeBuff connection (self-hosted / full access). Injected as env vars into
  // the FreeBuff terminal session so users can point the CLI at their own VPS.
  // (FreeBuff has no API keys — connection is via proxy/backend/env only.)
  freebuffProxyUrl: string;
  freebuffBackendUrl: string;
  freebuffExtraEnv: string;
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
  accent: 'violet',
  iconTheme: 'material',
  fontFamily: '',
  lineNumbers: 'on',
  cursorStyle: 'line',
  cursorBlinking: 'blink',
  renderWhitespace: 'selection',
  lineHeight: 1.55,
  fontLigatures: true,
  smoothScrolling: false,
  stickyScroll: true,
  bracketColorization: true,
  scrollBeyondLastLine: false,
  density: 'comfortable',
  reduceMotion: false,
  liquidGlass: false,
  formatOnSave: false,
  autoSave: true,
  autoSaveSeconds: 60,
  aiServerUrl: '',
  restoreLastFolder: false,
  agentAutoApply: false,
  freebuffProxyUrl: '',
  freebuffBackendUrl: '',
  freebuffExtraEnv: '',
  mode: 'normal',
  securityStance: 'balanced',
  securityPersona: { ...DEFAULT_SECURITY_PERSONA },
};

const KEY = 'strix.settings';
// One-time migrations keyed by a stored version, so theme refreshes reach
// existing installs (not just fresh ones) without wiping user choices.
const MIGRATION_KEY = 'strix.settings.migration';
const CURRENT_MIGRATION = 1;

function migrate(stored: Partial<Settings>): Partial<Settings> {
  let done = 0;
  try {
    done = Number(localStorage.getItem(MIGRATION_KEY) ?? '0') || 0;
  } catch {
    /* ignore */
  }
  const next = { ...stored };
  // v1: adopt the modern violet accent for installs still on the old amber
  // default (pre-release brand refresh).
  if (done < 1 && next.accent === 'amber') next.accent = 'violet';
  try {
    localStorage.setItem(MIGRATION_KEY, String(CURRENT_MIGRATION));
  } catch {
    /* ignore */
  }
  return next;
}

// Persisted user settings. Applies the theme to the document root so tokens.css
// can re-skin via [data-theme].
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...migrate(stored) };
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
    document.documentElement.dataset.density = settings.density;
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
    document.documentElement.dataset.glass = String(settings.liquidGlass);
    setIconTheme(settings.iconTheme);
  }, [settings]);

  const update = useCallback(
    (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );

  return [settings, update];
}
