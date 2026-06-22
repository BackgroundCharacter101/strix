import React, { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SECURITY_PERSONA, type SecurityPersona } from '@strix/ai-gateway';
import type { Settings, DirectModel } from './useSettings';
import type { AiProviderKey } from '../../main/bridge';
import { THEMES, ACCENTS } from './themes';
import { SaveIcon, CloseIcon } from './icons';
import { showToast } from './toast';
import { CYBERSEC_ENABLED, IS_COMPETITION } from './edition';
import { KEY_COMMANDS, resolveKey, eventAccelerator } from './keybindings';

// FreeLLMAPI providers the user can add a key for (ids match the server).
const KEY_PLATFORMS: { id: string; label: string }[] = [
  { id: 'groq', label: 'Groq' },
  { id: 'google', label: 'Google (Gemini)' },
  { id: 'cerebras', label: 'Cerebras' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'cohere', label: 'Cohere' },
  { id: 'nvidia', label: 'NVIDIA' },
  { id: 'sambanova', label: 'SambaNova' },
  { id: 'github', label: 'GitHub Models' },
  { id: 'cloudflare', label: 'Cloudflare' },
  { id: 'zhipu', label: 'Zhipu' },
  { id: 'huggingface', label: 'HuggingFace' },
];

const platformLabel = (id: string) => KEY_PLATFORMS.find((p) => p.id === id)?.label ?? id;

// Add / list / remove FreeLLMAPI provider keys without leaving the IDE. Targets
// the configured AI host (or the local server when blank).
function ProviderKeys({ serverUrl }: { serverUrl?: string }) {
  const [keys, setKeys] = useState<AiProviderKey[]>([]);
  const [platform, setPlatform] = useState('groq');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const url = serverUrl || undefined;

  const refresh = useCallback(() => {
    window.strix.ai
      .listKeys(url)
      .then(setKeys)
      .catch(() => setKeys([]));
  }, [url]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async () => {
    const key = value.trim();
    if (!key) return;
    setBusy(true);
    const res = await window.strix.ai.addKey(platform, key, url);
    setBusy(false);
    if (res.ok) {
      setValue('');
      showToast(`${platformLabel(platform)} key added`, 'success');
      refresh();
    } else {
      showToast(res.error || 'Could not add key', 'error', 6000);
    }
  };

  const remove = async (id: number) => {
    await window.strix.ai.deleteKey(id, url);
    showToast('API key removed', 'info');
    refresh();
  };

  return (
    <div className="set-keys">
      <div className="set-keys-add">
        <select
          aria-label="Provider"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          {KEY_PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          type="password"
          aria-label="API key"
          placeholder="Paste API key…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
        />
        <button type="button" className="set-save-btn" disabled={busy || !value.trim()} onClick={add}>
          {busy ? 'Adding…' : 'Add key'}
        </button>
      </div>
      {keys.length > 0 ? (
        <ul className="set-keys-list" aria-label="Provider keys">
          {keys.map((k) => (
            <li key={k.id}>
              <span className="set-key-platform">{platformLabel(k.platform)}</span>
              <code className="set-key-mask">{k.maskedKey}</code>
              <span className={`set-key-status set-key-${k.status}`}>{k.status}</span>
              <button
                type="button"
                className="set-key-remove"
                aria-label={`remove ${platformLabel(k.platform)} key`}
                title="Remove key"
                onClick={() => remove(k.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="set-keys-empty">
          No provider keys yet. Add one above (Groq, Gemini, OpenRouter… are free) to power the AI.
        </p>
      )}
    </div>
  );
}

// Friendly host label for a base URL (so the list reads "api.openai.com").
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Add / list / remove "bring your own" direct models. Each is an
// OpenAI-compatible endpoint + key + model id; they show up in the AI panel's
// model picker next to FreeLLMAPI's Auto. Stored locally (in Settings).
function DirectModels({
  models,
  onChange,
  enableLocalDetect,
}: {
  models: DirectModel[];
  onChange: (m: DirectModel[]) => void;
  // Competition: show "Detect local models" (probes Ollama / LM Studio).
  enableLocalDetect?: boolean;
}) {
  const [label, setLabel] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [detecting, setDetecting] = useState(false);

  const genId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const add = () => {
    const l = label.trim();
    const b = baseURL.trim();
    const k = apiKey.trim();
    const m = model.trim();
    if (!b || !k || !m) {
      showToast('Base URL, API key and model are all required', 'error', 5000);
      return;
    }
    onChange([...models, { id: genId(), label: l || m, baseURL: b, apiKey: k, model: m }]);
    setLabel('');
    setBaseURL('');
    setApiKey('');
    setModel('');
    showToast(`Added "${l || m}"`, 'success');
  };

  // Probe localhost for running model servers (Ollama / LM Studio) and add any
  // that aren't already in the list — no URL/model typing.
  const detect = async () => {
    setDetecting(true);
    try {
      const found = await window.strix.ai.detectLocal();
      if (!found.length) {
        showToast('No local model server found. Is Ollama / LM Studio running?', 'info', 6000);
        return;
      }
      const existing = new Set(models.map((d) => `${d.baseURL}|${d.model}`));
      const added = found
        .filter((f) => !existing.has(`${f.baseURL}|${f.model}`))
        .map((f) => ({
          id: genId(),
          label: f.label,
          baseURL: f.baseURL,
          apiKey: f.apiKey,
          model: f.model,
        }));
      if (!added.length) {
        showToast('Local models already added.', 'info');
        return;
      }
      onChange([...models, ...added]);
      showToast(`Added ${added.length} local model(s)`, 'success');
    } finally {
      setDetecting(false);
    }
  };

  const remove = (id: string) => {
    onChange(models.filter((d) => d.id !== id));
    showToast('Direct model removed', 'info');
  };

  return (
    <div className="set-keys">
      {enableLocalDetect && (
        <div className="set-directmodels-detect">
          <button type="button" className="set-save-btn" disabled={detecting} onClick={detect}>
            {detecting ? 'Scanning…' : 'Detect local models (Ollama / LM Studio)'}
          </button>
          <span className="set-desc">Finds running local servers and adds them automatically.</span>
        </div>
      )}
      <div className="set-directmodels-add">
        <input
          type="text"
          aria-label="Model label"
          placeholder="Label (e.g. GPT-4o mini)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          type="text"
          aria-label="Base URL"
          placeholder="https://api.openai.com/v1"
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
        />
        <input
          type="password"
          aria-label="Direct model API key"
          placeholder="API key (sk-…)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <input
          type="text"
          aria-label="Model id"
          placeholder="gpt-4o-mini"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <button type="button" className="set-save-btn" onClick={add}>
          Add model
        </button>
      </div>
      {models.length > 0 ? (
        <ul className="set-keys-list" aria-label="Direct models">
          {models.map((d) => (
            <li key={d.id}>
              <span className="set-key-platform">{d.label}</span>
              <code className="set-key-mask">{d.model}</code>
              <span className="set-key-status">{hostOf(d.baseURL)}</span>
              <button
                type="button"
                className="set-key-remove"
                aria-label={`remove ${d.label}`}
                title="Remove model"
                onClick={() => remove(d.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="set-keys-empty">
          No direct models yet. Add one above (OpenAI, OpenRouter, Groq, Together, DeepSeek, local
          Ollama…) to pick it in the AI panel next to Auto.
        </p>
      )}
    </div>
  );
}

type SectionId = 'appearance' | 'editor' | 'terminal' | 'keys' | 'ai' | 'security';

const SECTIONS: { id: SectionId; title: string }[] = [
  { id: 'appearance', title: 'Appearance' },
  { id: 'editor', title: 'Editor' },
  { id: 'terminal', title: 'Terminal' },
  { id: 'keys', title: 'Keyboard' },
  { id: 'ai', title: 'AI' },
  // Security AI persona configures Cybersec mode — Competition edition only.
  ...(CYBERSEC_ENABLED ? [{ id: 'security' as SectionId, title: 'Security AI' }] : []),
];

function Row({
  query,
  label,
  desc,
  children,
}: {
  query: string;
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  if (query && !`${label} ${desc}`.toLowerCase().includes(query.toLowerCase())) return null;
  return (
    <div className="set-row">
      <div className="set-info">
        <div className="set-label">{label}</div>
        <div className="set-desc">{desc}</div>
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

export function SettingsPage({
  settings,
  onChange,
  onReset,
  onClose,
  onSave,
  initialSection = 'appearance',
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  onClose: () => void;
  // Explicitly persist the current settings (they already apply live).
  onSave?: () => void;
  // Section to open at (deep-link, e.g. "ai" from the AI panel's config prompt).
  initialSection?: SectionId;
}) {
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState<SectionId>(initialSection);
  // The shortcut row currently capturing a new key combo (command id), if any.
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const searching = query.trim() !== '';
  // While searching, show every section so matches surface; otherwise show only
  // the selected one (a clean, tabbed full-screen layout).
  const showSection = (id: SectionId) => searching || activeSection === id;

  const handleSave = () => {
    onSave?.();
    showToast('Settings saved', 'success');
  };

  const persona = settings.securityPersona;
  const setPersona = (key: keyof SecurityPersona, value: string) =>
    onChange({ securityPersona: { ...persona, [key]: value } });
  const personaEdited = (Object.keys(DEFAULT_SECURITY_PERSONA) as (keyof SecurityPersona)[]).some(
    (k) => persona[k] !== DEFAULT_SECURITY_PERSONA[k],
  );

  return (
    <div className="settings-page" aria-label="settings">
      <div className="settings-toolbar">
        <h1 className="settings-heading">Settings</h1>
        <input
          className="settings-search"
          aria-label="Search settings"
          placeholder="Search settings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="set-save-btn"
          onClick={handleSave}
          title="Save settings"
        >
          <SaveIcon size={15} />
          Save
        </button>
        <button type="button" className="ai-ghost-btn" onClick={onReset}>
          Reset
        </button>
        <button
          type="button"
          className="set-close-btn"
          onClick={onClose}
          title="Close settings (Esc)"
          aria-label="Close settings"
        >
          <CloseIcon size={14} />
          Done
        </button>
      </div>

      <div className="settings-main">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="settings-nav-item"
              aria-current={!searching && activeSection === s.id}
              onClick={() => {
                setQuery('');
                setActiveSection(s.id);
              }}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div className="settings-body">
        {showSection('appearance') && (
        <section className="set-section">
          <h3>Appearance</h3>
          <Row query={query} label="Color theme" desc="Overall UI theme.">
            <select
              aria-label="Color theme"
              value={settings.theme}
              onChange={(e) => onChange({ theme: e.target.value as Settings['theme'] })}
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Row>
          <Row query={query} label="Accent color" desc="Highlight colour for the UI and editor.">
            <div className="accent-swatches" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.accent === a.id}
                  aria-label={a.label}
                  title={a.label}
                  className="accent-swatch"
                  data-active={settings.accent === a.id}
                  style={{ background: a.hex }}
                  onClick={() => onChange({ accent: a.id })}
                />
              ))}
            </div>
          </Row>
          <Row query={query} label="Density" desc="Spacing of list rows and tabs.">
            <select
              aria-label="Density"
              value={settings.density}
              onChange={(e) => onChange({ density: e.target.value as Settings['density'] })}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </Row>
          <Row query={query} label="File icon theme" desc="Icons shown in the Explorer and tabs.">
            <select
              aria-label="File icon theme"
              value={settings.iconTheme}
              onChange={(e) => onChange({ iconTheme: e.target.value as Settings['iconTheme'] })}
            >
              <option value="material">Material Icons (colorful)</option>
              <option value="strix">Strix (minimal)</option>
            </select>
          </Row>
          <Row query={query} label="Reduce motion" desc="Minimize non-essential UI animations.">
            <input
              type="checkbox"
              aria-label="Reduce motion"
              checked={settings.reduceMotion}
              onChange={(e) => onChange({ reduceMotion: e.target.checked })}
            />
          </Row>
          <Row
            query={query}
            label="Liquid Glass"
            desc="Frosted translucent blur on menus, dialogs, and side panels."
          >
            <input
              type="checkbox"
              aria-label="Liquid Glass"
              checked={settings.liquidGlass}
              onChange={(e) => onChange({ liquidGlass: e.target.checked })}
            />
          </Row>
        </section>
        )}

        {showSection('editor') && (
        <section className="set-section">
          <h3>Editor</h3>
          <Row query={query} label="Font size" desc="Editor font size in pixels.">
            <input
              type="number"
              aria-label="Font size"
              min={8}
              max={32}
              value={settings.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) || 13 })}
            />
          </Row>
          <Row query={query} label="Font family" desc="Editor font. Leave blank for the Strix default (Cascadia Code).">
            <input
              type="text"
              aria-label="Font family"
              placeholder="Cascadia Code, Consolas, monospace"
              value={settings.fontFamily}
              onChange={(e) => onChange({ fontFamily: e.target.value })}
            />
          </Row>
          <Row query={query} label="Tab size" desc="Number of spaces a tab is equal to.">
            <input
              type="number"
              aria-label="Tab size"
              min={1}
              max={8}
              value={settings.tabSize}
              onChange={(e) => onChange({ tabSize: Number(e.target.value) || 2 })}
            />
          </Row>
          <Row
            query={query}
            label="Indent using spaces"
            desc="Insert spaces when pressing Tab (off = real tab characters)."
          >
            <input
              type="checkbox"
              aria-label="Indent using spaces"
              checked={settings.insertSpaces}
              onChange={(e) => onChange({ insertSpaces: e.target.checked })}
            />
          </Row>
          <Row query={query} label="Word wrap" desc="Wrap long lines instead of scrolling.">
            <input
              type="checkbox"
              aria-label="Word wrap"
              checked={settings.wordWrap}
              onChange={(e) => onChange({ wordWrap: e.target.checked })}
            />
          </Row>
          <Row query={query} label="Line numbers" desc="How line numbers are displayed.">
            <select
              aria-label="Line numbers"
              value={settings.lineNumbers}
              onChange={(e) => onChange({ lineNumbers: e.target.value as Settings['lineNumbers'] })}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
              <option value="relative">Relative</option>
            </select>
          </Row>
          <Row query={query} label="Cursor style" desc="Shape of the text cursor.">
            <select
              aria-label="Cursor style"
              value={settings.cursorStyle}
              onChange={(e) => onChange({ cursorStyle: e.target.value as Settings['cursorStyle'] })}
            >
              <option value="line">Line</option>
              <option value="block">Block</option>
              <option value="underline">Underline</option>
            </select>
          </Row>
          <Row query={query} label="Render whitespace" desc="Show whitespace characters.">
            <select
              aria-label="Render whitespace"
              value={settings.renderWhitespace}
              onChange={(e) =>
                onChange({ renderWhitespace: e.target.value as Settings['renderWhitespace'] })
              }
            >
              <option value="none">None</option>
              <option value="boundary">Boundary</option>
              <option value="selection">Selection</option>
              <option value="all">All</option>
            </select>
          </Row>
          <Row query={query} label="Cursor blinking" desc="How the text cursor animates.">
            <select
              aria-label="Cursor blinking"
              value={settings.cursorBlinking}
              onChange={(e) =>
                onChange({ cursorBlinking: e.target.value as Settings['cursorBlinking'] })
              }
            >
              <option value="blink">Blink</option>
              <option value="smooth">Smooth</option>
              <option value="phase">Phase</option>
              <option value="expand">Expand</option>
              <option value="solid">Solid</option>
            </select>
          </Row>
          <Row query={query} label="Line height" desc="Line spacing as a multiple of the font size.">
            <input
              type="number"
              aria-label="Line height"
              min={1}
              max={2.5}
              step={0.05}
              value={settings.lineHeight}
              onChange={(e) =>
                onChange({ lineHeight: Math.min(2.5, Math.max(1, Number(e.target.value) || 1.55)) })
              }
            />
          </Row>
          <Row query={query} label="Font ligatures" desc="Render programming ligatures (e.g. =>, !==).">
            <input
              type="checkbox"
              aria-label="Font ligatures"
              checked={settings.fontLigatures}
              onChange={(e) => onChange({ fontLigatures: e.target.checked })}
            />
          </Row>
          <Row query={query} label="Sticky scroll" desc="Pin the enclosing scope (function/class) to the top.">
            <input
              type="checkbox"
              aria-label="Sticky scroll"
              checked={settings.stickyScroll}
              onChange={(e) => onChange({ stickyScroll: e.target.checked })}
            />
          </Row>
          <Row
            query={query}
            label="Bracket pair colorization"
            desc="Colour matching brackets so nesting is easy to follow."
          >
            <input
              type="checkbox"
              aria-label="Bracket pair colorization"
              checked={settings.bracketColorization}
              onChange={(e) => onChange({ bracketColorization: e.target.checked })}
            />
          </Row>
          <Row query={query} label="Smooth scrolling" desc="Animate scrolling instead of jumping.">
            <input
              type="checkbox"
              aria-label="Smooth scrolling"
              checked={settings.smoothScrolling}
              onChange={(e) => onChange({ smoothScrolling: e.target.checked })}
            />
          </Row>
          <Row
            query={query}
            label="Scroll beyond last line"
            desc="Allow scrolling past the final line of the file."
          >
            <input
              type="checkbox"
              aria-label="Scroll beyond last line"
              checked={settings.scrollBeyondLastLine}
              onChange={(e) => onChange({ scrollBeyondLastLine: e.target.checked })}
            />
          </Row>
          <Row query={query} label="Minimap" desc="Show the code minimap on the right.">
            <input
              type="checkbox"
              aria-label="Minimap"
              checked={settings.minimap}
              onChange={(e) => onChange({ minimap: e.target.checked })}
            />
          </Row>
          <Row query={query} label="Format on save" desc="Run the language formatter when you save a file.">
            <input
              type="checkbox"
              aria-label="Format on save"
              checked={settings.formatOnSave}
              onChange={(e) => onChange({ formatOnSave: e.target.checked })}
            />
          </Row>
          <Row
            query={query}
            label="Trim trailing whitespace on save"
            desc="Remove spaces/tabs at the end of each line when saving."
          >
            <input
              type="checkbox"
              aria-label="Trim trailing whitespace on save"
              checked={settings.trimTrailingWhitespace}
              onChange={(e) => onChange({ trimTrailingWhitespace: e.target.checked })}
            />
          </Row>
          <Row
            query={query}
            label="Insert final newline on save"
            desc="Ensure files end with a single newline."
          >
            <input
              type="checkbox"
              aria-label="Insert final newline on save"
              checked={settings.insertFinalNewline}
              onChange={(e) => onChange({ insertFinalNewline: e.target.checked })}
            />
          </Row>
          <Row query={query} label="End of line" desc="Line endings written on save.">
            <select
              aria-label="End of line"
              value={settings.eol}
              onChange={(e) => onChange({ eol: e.target.value as 'keep' | 'lf' | 'crlf' })}
            >
              <option value="keep">Keep as-is</option>
              <option value="lf">LF (\n)</option>
              <option value="crlf">CRLF (\r\n)</option>
            </select>
          </Row>
          <Row query={query} label="Auto save" desc="Periodically write unsaved changes to disk.">
            <input
              type="checkbox"
              aria-label="Auto save"
              checked={settings.autoSave}
              onChange={(e) => onChange({ autoSave: e.target.checked })}
            />
          </Row>
          <Row
            query={query}
            label="Reopen last folder on startup"
            desc="Open the most recent folder (and its tabs) on launch instead of the welcome screen."
          >
            <input
              type="checkbox"
              aria-label="Reopen last folder on startup"
              checked={settings.restoreLastFolder}
              onChange={(e) => onChange({ restoreLastFolder: e.target.checked })}
            />
          </Row>
          <Row
            query={query}
            label="Auto save interval"
            desc="Seconds between auto-saves (min 5)."
          >
            <input
              type="number"
              aria-label="Auto save interval"
              min={5}
              value={settings.autoSaveSeconds}
              onChange={(e) =>
                onChange({ autoSaveSeconds: Math.max(5, Number(e.target.value) || 60) })
              }
            />
          </Row>
          <Row
            query={query}
            label="Exclude folders"
            desc="Comma-separated folder names to skip in the file tree, search and AI scan (on top of the built-ins: node_modules, .git, dist, build, target, .venv, …). Helps big projects stay fast."
          >
            <input
              type="text"
              aria-label="Exclude folders"
              placeholder="logs, tmp, fixtures"
              value={settings.excludeFolders}
              onChange={(e) => onChange({ excludeFolders: e.target.value })}
            />
          </Row>
        </section>
        )}

        {showSection('terminal') && (
        <section className="set-section">
          <h3>Terminal</h3>
          <Row
            query={query}
            label="Font size"
            desc="Terminal font size in pixels (0 = follow the editor font size)."
          >
            <input
              type="number"
              aria-label="Terminal font size"
              min={0}
              max={32}
              value={settings.terminalFontSize}
              onChange={(e) => onChange({ terminalFontSize: Number(e.target.value) || 0 })}
            />
          </Row>
          <Row
            query={query}
            label="Font family"
            desc="Terminal font. Blank = follow the editor font."
          >
            <input
              type="text"
              aria-label="Terminal font family"
              placeholder="Cascadia Code, Consolas, monospace"
              value={settings.terminalFontFamily}
              onChange={(e) => onChange({ terminalFontFamily: e.target.value })}
            />
          </Row>
          <Row query={query} label="Cursor style" desc="Shape of the terminal cursor.">
            <select
              aria-label="Terminal cursor style"
              value={settings.terminalCursorStyle}
              onChange={(e) =>
                onChange({
                  terminalCursorStyle: e.target.value as 'block' | 'underline' | 'bar',
                })
              }
            >
              <option value="block">Block</option>
              <option value="bar">Bar</option>
              <option value="underline">Underline</option>
            </select>
          </Row>
          <Row
            query={query}
            label="Shell"
            desc="Executable for new terminals (e.g. powershell.exe, pwsh.exe, cmd.exe, bash). Blank = system default. Reopen the terminal to apply."
          >
            <input
              type="text"
              aria-label="Terminal shell"
              placeholder="powershell.exe"
              value={settings.terminalShell}
              onChange={(e) => onChange({ terminalShell: e.target.value })}
            />
          </Row>
        </section>
        )}

        {showSection('keys') && (
        <section className="set-section">
          <h3>Keyboard shortcuts</h3>
          {KEY_COMMANDS.map((cmd) => {
            const current = resolveKey(cmd.id, settings.keybindings);
            const overridden = !!settings.keybindings[cmd.id];
            return (
              <Row key={cmd.id} query={query} label={cmd.label} desc={`Default: ${cmd.defaultKey}`}>
                <div className="key-row">
                  <button
                    type="button"
                    className={`key-cap${recordingKey === cmd.id ? ' is-recording' : ''}`}
                    aria-label={`Change shortcut for ${cmd.label}`}
                    onClick={() => setRecordingKey(cmd.id)}
                    onBlur={() => setRecordingKey((r) => (r === cmd.id ? null : r))}
                    onKeyDown={(e) => {
                      if (recordingKey !== cmd.id) return;
                      e.preventDefault();
                      if (e.key === 'Escape') {
                        setRecordingKey(null);
                        return;
                      }
                      // Ignore lone modifier presses; wait for a real key.
                      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
                      const accel = eventAccelerator(e);
                      onChange({ keybindings: { ...settings.keybindings, [cmd.id]: accel } });
                      setRecordingKey(null);
                    }}
                  >
                    {recordingKey === cmd.id ? 'Press keys…' : current}
                  </button>
                  {overridden && (
                    <button
                      type="button"
                      className="scm-link"
                      aria-label={`Reset ${cmd.label} shortcut`}
                      onClick={() => {
                        const next = { ...settings.keybindings };
                        delete next[cmd.id];
                        onChange({ keybindings: next });
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </Row>
            );
          })}
          <Row query={query} label="Reset all shortcuts" desc="Restore every shortcut to its default.">
            <button type="button" onClick={() => onChange({ keybindings: {} })}>
              Reset all
            </button>
          </Row>
        </section>
        )}

        {showSection('ai') && (
        <section className="set-section">
          <h3>AI</h3>
          <Row
            query={query}
            label="AI server URL"
            desc="A shared FreeLLMAPI host for the team (e.g. http://192.168.1.50:3001). Leave blank to use the local server."
          >
            <input
              type="text"
              aria-label="AI server URL"
              placeholder="http://localhost:3001"
              value={settings.aiServerUrl}
              onChange={(e) => onChange({ aiServerUrl: e.target.value })}
            />
          </Row>

          <Row
            query={query}
            label="Default model"
            desc="Model selected by default in the AI panel. 'auto' lets the router pick. Direct models you add below also appear in that picker."
          >
            <input
              type="text"
              aria-label="Default model"
              placeholder="auto"
              value={settings.aiDefaultModel}
              onChange={(e) => onChange({ aiDefaultModel: e.target.value || 'auto' })}
            />
          </Row>

          <div className="set-row set-row-block">
            <div className="set-info">
              <div className="set-label">Direct API key models</div>
              <div className="set-desc">
                Bring your own models from any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq,
                Together, Mistral, DeepSeek, local Ollama/LM Studio). Each one shows up in the AI
                panel&apos;s model picker next to Auto — pick per message. Keys are stored locally
                and sent only to that provider (through the app&apos;s main process, never the
                renderer).
              </div>
            </div>
          </div>
          <DirectModels
            models={settings.aiDirectModels}
            onChange={(m) => onChange({ aiDirectModels: m })}
            enableLocalDetect={IS_COMPETITION}
          />

          <Row
            query={query}
            label="Temperature"
            desc="Creativity vs. determinism (0 = focused, 2 = wild). 0.7 is a good default."
          >
            <input
              type="number"
              aria-label="Temperature"
              min={0}
              max={2}
              step={0.1}
              value={settings.aiTemperature}
              onChange={(e) =>
                onChange({ aiTemperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })
              }
            />
          </Row>
          <Row
            query={query}
            label="Max response tokens"
            desc="Cap the AI's response length for chat/explain/fix (0 = provider default)."
          >
            <input
              type="number"
              aria-label="Max response tokens"
              min={0}
              max={32000}
              step={256}
              value={settings.aiMaxTokens}
              onChange={(e) => onChange({ aiMaxTokens: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Row>

          <Row
            query={query}
            label="GitHub client ID"
            desc='For "Sign in with GitHub" (browser). Register a free OAuth App at github.com/settings/applications/new with Device Flow enabled, then paste its Client ID here. Shareable across the team.'
          >
            <input
              type="text"
              aria-label="GitHub client ID"
              placeholder="Iv1.xxxxxxxxxxxxxxxx"
              value={settings.githubClientId}
              onChange={(e) => onChange({ githubClientId: e.target.value })}
            />
          </Row>

          <Row
            query={query}
            label="Apply AI changes without confirming"
            desc="Hands-off agent: write file changes immediately, skipping the review/diff modal."
          >
            <input
              type="checkbox"
              aria-label="Apply AI changes without confirming"
              checked={settings.agentAutoApply}
              onChange={(e) => onChange({ agentAutoApply: e.target.checked })}
            />
          </Row>

          <div className="set-row set-row-block">
            <div className="set-info">
              <div className="set-label">FreeBuff connection (your own VPS / full access)</div>
              <div className="set-desc">
                Point the FreeBuff agent at your own server for full, unthrottled access. These
                are injected as environment variables when FreeBuff launches. After changing them,
                close the FreeBuff terminal tab and click <em>Ask FreeBuff</em> again to apply.
              </div>
            </div>
          </div>
          <details className="set-guide">
            <summary>📖 New to this? Step-by-step guide (no tech knowledge needed)</summary>
            <div className="set-guide-body">
              <p>
                <strong>Don&apos;t have your own server?</strong> Then skip this whole section —
                FreeBuff already works out of the box, just with the free limits. Nothing here is
                required.
              </p>

              <h4>Which box do I fill in?</h4>
              <p>You almost never need all three — pick the ONE that matches what you were given:</p>
              <ul>
                <li>
                  <strong>Someone gave you a server address with a port</strong> (looks like{' '}
                  <code>http://203.0.113.7:8080</code> — an address, a colon, a number) → put it in{' '}
                  <strong>Proxy / VPS URL</strong>. Done.
                </li>
                <li>
                  <strong>Someone gave you a website-style address</strong> (looks like{' '}
                  <code>https://freebuff.mycompany.com</code>) → put it in{' '}
                  <strong>Self-hosted backend URL</strong>. Done.
                </li>
                <li>
                  <strong>Someone gave you lines that contain an = sign</strong> (like{' '}
                  <code>SOME_NAME=some-value</code>) → paste them, exactly as given, one per line,
                  into <strong>Extra environment variables</strong>. Done.
                </li>
              </ul>

              <h4>Then make it take effect (3 clicks)</h4>
              <ol>
                <li>
                  Click <strong>Save</strong> at the top of Settings.
                </li>
                <li>
                  If a <strong>FreeBuff</strong> tab is open in the terminal at the bottom, close it
                  with the little <strong>×</strong> next to its name.
                </li>
                <li>
                  Click <strong>Ask FreeBuff</strong> (or the ✨ FreeBuff button) — the new session
                  now uses your server.
                </li>
              </ol>

              <h4>If it doesn&apos;t work</h4>
              <ul>
                <li>
                  Check for typos — no spaces before/after what you pasted, and addresses must
                  start with <code>http://</code> or <code>https://</code>.
                </li>
                <li>
                  If you use a VPN app to reach the server, make sure the VPN is{' '}
                  <strong>switched on</strong> before opening FreeBuff.
                </li>
                <li>
                  Still stuck? Ask the person who runs your server for the exact value — then paste
                  it into <strong>Extra environment variables</strong> exactly as they wrote it
                  (that box always wins over the others).
                </li>
              </ul>

              <p className="set-guide-note">
                🔒 Everything you enter here stays on this computer. It is only handed to FreeBuff
                when it starts — Strix never sends it anywhere else.
              </p>
            </div>
          </details>
          <Row
            query={query}
            label="Proxy / VPS URL"
            desc="Route FreeBuff's traffic through your VPS/VPN (sets HTTP(S)_PROXY)."
          >
            <input
              type="text"
              aria-label="FreeBuff proxy URL"
              placeholder="http://your-vps:8080"
              value={settings.freebuffProxyUrl}
              onChange={(e) => onChange({ freebuffProxyUrl: e.target.value })}
            />
          </Row>
          <Row
            query={query}
            label="Self-hosted backend URL"
            desc="If you run the FreeBuff/Codebuff backend yourself, its base URL."
          >
            <input
              type="text"
              aria-label="FreeBuff backend URL"
              placeholder="https://freebuff.your-domain.com"
              value={settings.freebuffBackendUrl}
              onChange={(e) => onChange({ freebuffBackendUrl: e.target.value })}
            />
          </Row>
          <Row
            query={query}
            label="Extra environment variables"
            desc="One KEY=VALUE per line — overrides the above. Use FreeBuff's documented names."
          >
            <textarea
              className="set-textarea"
              aria-label="FreeBuff extra environment variables"
              rows={3}
              placeholder={'HTTPS_PROXY=…\nCODEBUFF_BACKEND_URL=…'}
              value={settings.freebuffExtraEnv}
              onChange={(e) => onChange({ freebuffExtraEnv: e.target.value })}
            />
          </Row>

          <div className="set-row set-row-block">
            <div className="set-info">
              <div className="set-label">FreeLLMAPI provider keys</div>
              <div className="set-desc">
                Free LLM providers for the built-in Auto router — no need to open the server&apos;s
                web page. Keys are stored encrypted on the AI host above (local by default).
              </div>
            </div>
          </div>
          <ProviderKeys serverUrl={settings.aiServerUrl} />
        </section>
        )}

        {CYBERSEC_ENABLED && showSection('security') && (
        <section className="set-section">
          <h3>Security AI persona</h3>
          <p className="set-section-note">
            Instructions prepended to the AI in <strong>Cybersec mode</strong>. The <em>base</em>{' '}
            always applies; the offensive / balanced / defensive text is added based on the active
            stance (chosen in the AI panel).
          </p>
          {(
            [
              ['base', 'Base instructions', 'Always applied in Cybersec mode.'],
              ['offensive', 'Offensive (red-team)', 'Added when the stance is Offensive.'],
              ['balanced', 'Balanced', 'Added when the stance is Balanced.'],
              ['defensive', 'Defensive (blue-team)', 'Added when the stance is Defensive.'],
            ] as [keyof SecurityPersona, string, string][]
          ).map(([key, label, desc]) => (
            <Row key={key} query={query} label={label} desc={desc}>
              <textarea
                className="set-textarea"
                aria-label={label}
                rows={4}
                value={persona[key]}
                onChange={(e) => setPersona(key, e.target.value)}
              />
            </Row>
          ))}
          <Row
            query={query}
            label="Reset persona"
            desc="Restore the default security instructions."
          >
            <button
              type="button"
              className="set-reset-btn"
              disabled={!personaEdited}
              onClick={() => onChange({ securityPersona: { ...DEFAULT_SECURITY_PERSONA } })}
            >
              Reset to defaults
            </button>
          </Row>
        </section>
        )}
        </div>
      </div>
    </div>
  );
}
