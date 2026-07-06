import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SECURITY_PERSONA, type SecurityStance, type SecurityPersona } from '@strix/ai-gateway';
import type { ThemeId, AccentId } from './themes';
import { setIconTheme, type IconTheme } from './iconTheme';

// A user-added direct model: an OpenAI-compatible endpoint + key + model id,
// shown by `label` in the AI panel's model picker. `id` is a stable local key.
export interface DirectModel {
  id: string;
  label: string;
  baseURL: string;
  apiKey: string;
  model: string;
  // API shape: 'anthropic' → native Claude Messages API; else (undefined)
  // OpenAI-compatible. Set from the provider preset when the model is added.
  provider?: string;
}

export interface Settings {
  fontSize: number;
  tabSize: number;
  // Indent with spaces (true) or real tab characters (false).
  insertSpaces: boolean;
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
  // Terminal: 0/blank = inherit the editor font. cursor + shell are explicit.
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalCursorStyle: 'block' | 'underline' | 'bar';
  terminalShell: string;
  // Keyboard shortcut overrides: command id → accelerator (e.g. "Ctrl+B").
  keybindings: Record<string, string>;
  // Format the document with the language formatter on every save.
  formatOnSave: boolean;
  // On-save text hygiene.
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
  eol: 'keep' | 'lf' | 'crlf';
  // Auto-save: periodically write dirty buffers. autoSaveSeconds is the interval.
  autoSave: boolean;
  autoSaveSeconds: number;
  // Extra folder names to exclude from the file tree / search / AI scan (on top
  // of the built-in node_modules/.git/build/target/… list). Comma-separated.
  excludeFolders: string;
  // Shared FreeLLMAPI host, e.g. http://192.168.1.50:3001 (blank = local).
  aiServerUrl: string;
  // AI tuning. Default model seeds the picker; temperature 0–2; maxTokens 0 =
  // provider default (applies to free-form tasks, not autocomplete/scaffold).
  aiDefaultModel: string;
  aiTemperature: number;
  aiMaxTokens: number;
  // User-added direct models (bring your own OpenAI-compatible endpoint + key).
  // These appear in the AI panel's model picker alongside FreeLLMAPI's Auto +
  // models; picking one routes that request straight to the provider (through
  // the main process), no FreeLLMAPI involved. Empty = FreeLLMAPI only.
  aiDirectModels: DirectModel[];
  // Reopen the most-recently-used folder (and its tabs) automatically on launch
  // instead of showing the welcome screen.
  restoreLastFolder: boolean;
  // GitHub OAuth App client ID for browser "Sign in with GitHub" (Device Flow).
  // Public/shareable; blank disables browser sign-in (token paste still works).
  githubClientId: string;
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
  insertSpaces: true,
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
  terminalFontSize: 0,
  terminalFontFamily: '',
  terminalCursorStyle: 'block',
  terminalShell: '',
  keybindings: {},
  formatOnSave: false,
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
  eol: 'keep',
  autoSave: true,
  autoSaveSeconds: 60,
  excludeFolders: '',
  aiServerUrl: '',
  aiDefaultModel: 'auto',
  aiTemperature: 0.7,
  aiMaxTokens: 0,
  aiDirectModels: [],
  restoreLastFolder: false,
  githubClientId: '',
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
