import React, { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SECURITY_PERSONA, type SecurityPersona } from '@strix/ai-gateway';
import type { Settings } from './useSettings';
import type { AiProviderKey } from '../../main/bridge';
import { THEMES, ACCENTS } from './themes';
import { SaveIcon, CloseIcon } from './icons';
import { showToast } from './toast';

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

type SectionId = 'appearance' | 'editor' | 'ai' | 'security';

const SECTIONS: { id: SectionId; title: string }[] = [
  { id: 'appearance', title: 'Appearance' },
  { id: 'editor', title: 'Editor' },
  { id: 'ai', title: 'AI' },
  { id: 'security', title: 'Security AI' },
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

          <div className="set-row set-row-block">
            <div className="set-info">
              <div className="set-label">Provider API keys</div>
              <div className="set-desc">
                Add keys for the free LLM providers right here — no need to open the server&apos;s
                web page. Keys are stored encrypted on the AI host above (local by default).
              </div>
            </div>
          </div>
          <ProviderKeys serverUrl={settings.aiServerUrl} />
        </section>
        )}

        {showSection('security') && (
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
