import React, { useState } from 'react';
import { DEFAULT_SECURITY_PERSONA, type SecurityPersona } from '@strix/ai-gateway';
import type { Settings } from './useSettings';
import { THEMES, ACCENTS } from './themes';
import {
  CloseIcon,
  SparkleIcon,
  FileGlyph,
  TerminalIcon,
  PlanIcon,
  AgentsIcon,
  ProblemsIcon,
} from './icons';
import { Row, Toggle } from './SettingsControls';
import { CYBERSEC_ENABLED } from './edition';
import { KEY_COMMANDS, resolveKey, eventAccelerator } from './keybindings';
import { SettingsJson } from './SettingsJson';
import { SettingsProviders } from './SettingsProviders';
import { SettingsEditor } from './SettingsEditor';

type SectionId = 'appearance' | 'editor' | 'terminal' | 'keys' | 'ai' | 'security';

const SECTIONS: { id: SectionId; title: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'appearance', title: 'Appearance', Icon: SparkleIcon },
  { id: 'editor', title: 'Editor', Icon: FileGlyph },
  { id: 'terminal', title: 'Terminal', Icon: TerminalIcon },
  { id: 'keys', title: 'Keyboard', Icon: PlanIcon },
  { id: 'ai', title: 'AI', Icon: AgentsIcon },
  // Security AI persona configures Cybersec mode — Competition edition only.
  ...(CYBERSEC_ENABLED ? [{ id: 'security' as SectionId, title: 'Security AI', Icon: ProblemsIcon }] : []),
];

export function SettingsPage({
  settings,
  onChange,
  onReset,
  onClose,
  initialSection = 'appearance',
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  onClose: () => void;
  // Section to open at (deep-link, e.g. "ai" from the AI panel's config prompt).
  initialSection?: SectionId;
}) {
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState<SectionId>(initialSection);
  // The shortcut row currently capturing a new key combo (command id), if any.
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  // Reset to defaults is destructive, so it needs a second confirming click.
  const [confirmingReset, setConfirmingReset] = useState(false);
  // GUI is the normal tabbed view; JSON is a raw, derived view of the same
  // settings state (see SettingsJson) — never a second source of truth.
  const [view, setView] = useState<'gui' | 'json'>('gui');
  const searching = query.trim() !== '';
  // While searching, show every section so matches surface; otherwise show only
  // the selected one (a clean, tabbed full-screen layout).
  const showSection = (id: SectionId) => searching || activeSection === id;

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
        <div className="settings-view-switch" data-view={view} role="group" aria-label="Settings view">
          <div className="settings-view-thumb" aria-hidden="true" />
          <button
            type="button"
            className="settings-view-btn"
            aria-pressed={view === 'gui'}
            onClick={() => setView('gui')}
          >
            GUI
          </button>
          <button
            type="button"
            className="settings-view-btn"
            aria-pressed={view === 'json'}
            onClick={() => setView('json')}
          >
            JSON
          </button>
        </div>
        {confirmingReset ? (
          <>
            <button
              type="button"
              className="ai-ghost-btn set-btn-danger"
              onClick={() => {
                setConfirmingReset(false);
                onReset();
              }}
            >
              Reset everything
            </button>
            <button type="button" className="ai-ghost-btn" onClick={() => setConfirmingReset(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="ai-ghost-btn" onClick={() => setConfirmingReset(true)}>
            Reset to defaults
          </button>
        )}
        <button
          type="button"
          className="set-close-btn"
          onClick={onClose}
          title="Close settings (Esc)"
          aria-label="Close settings"
        >
          <CloseIcon size={14} />
          Close
        </button>
      </div>

      <div className="settings-main">
        {view === 'json' ? (
          // Mounted only while this view is selected, so a second Monaco
          // instance never exists alongside the GUI's editors.
          <div className="settings-body">
            <SettingsJson settings={settings} onApply={onChange} />
          </div>
        ) : (
        <>
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="settings-nav-item"
              aria-current={!searching && activeSection === s.id ? 'true' : undefined}
              onClick={() => {
                setQuery('');
                setActiveSection(s.id);
              }}
            >
              <s.Icon size={14} />
              {s.title}
            </button>
          ))}
        </nav>

        <div className="settings-body">
        <div className="settings-col">
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
            <Toggle
              checked={settings.reduceMotion}
              onChange={(v) => onChange({ reduceMotion: v })}
              label="Reduce motion"
            />
          </Row>
          <Row
            query={query}
            label="Liquid Glass"
            desc="Frosted translucent blur on menus, dialogs, and side panels."
          >
            <Toggle
              checked={settings.liquidGlass}
              onChange={(v) => onChange({ liquidGlass: v })}
              label="Liquid Glass"
            />
          </Row>
        </section>
        )}

        {showSection('editor') && (
          <SettingsEditor settings={settings} onChange={onChange} query={query} />
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
          <SettingsProviders settings={settings} onChange={onChange} query={query} />
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
        </>
        )}
      </div>
    </div>
  );
}
