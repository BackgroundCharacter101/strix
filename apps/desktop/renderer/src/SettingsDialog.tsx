import React from 'react';
import type { Settings } from './useSettings';

export function SettingsDialog({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}) {
  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="dialog settings-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">Settings</h2>

        <label className="settings-row">
          <span>Color theme</span>
          <select
            aria-label="Color theme"
            value={settings.theme}
            onChange={(e) => onChange({ theme: e.target.value as Settings['theme'] })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <label className="settings-row">
          <span>Font size</span>
          <input
            type="number"
            aria-label="Font size"
            min={8}
            max={32}
            value={settings.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) || 13 })}
          />
        </label>

        <label className="settings-row">
          <span>Tab size</span>
          <input
            type="number"
            aria-label="Tab size"
            min={1}
            max={8}
            value={settings.tabSize}
            onChange={(e) => onChange({ tabSize: Number(e.target.value) || 2 })}
          />
        </label>

        <label className="settings-row">
          <span>Word wrap</span>
          <input
            type="checkbox"
            aria-label="Word wrap"
            checked={settings.wordWrap}
            onChange={(e) => onChange({ wordWrap: e.target.checked })}
          />
        </label>

        <label className="settings-row">
          <span>Minimap</span>
          <input
            type="checkbox"
            aria-label="Minimap"
            checked={settings.minimap}
            onChange={(e) => onChange({ minimap: e.target.checked })}
          />
        </label>

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
