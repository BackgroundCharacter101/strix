import React, { useState } from 'react';
import type { Settings } from './useSettings';
import { THEMES, ACCENTS } from './themes';

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
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

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
        <button type="button" className="ai-ghost-btn" onClick={onReset}>
          Reset
        </button>
        <button type="button" className="ai-ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="settings-body">
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
        </section>

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
          <Row query={query} label="Minimap" desc="Show the code minimap on the right.">
            <input
              type="checkbox"
              aria-label="Minimap"
              checked={settings.minimap}
              onChange={(e) => onChange({ minimap: e.target.checked })}
            />
          </Row>
        </section>

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
        </section>
      </div>
    </div>
  );
}
