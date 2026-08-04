import React from 'react';
import type { Settings } from './useSettings';
import { Row, Toggle } from './SettingsControls';

// The "Editor" settings tab: font, whitespace, cursor, save behaviour, etc.
// Pulled out of SettingsPage.tsx — it's the single largest section (24 rows)
// and self-contained (only needs settings/onChange/query).
export function SettingsEditor({
  settings,
  onChange,
  query,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  query: string;
}) {
  return (
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
        <Toggle
          checked={settings.insertSpaces}
          onChange={(v) => onChange({ insertSpaces: v })}
          label="Indent using spaces"
        />
      </Row>
      <Row query={query} label="Word wrap" desc="Wrap long lines instead of scrolling.">
        <Toggle
          checked={settings.wordWrap}
          onChange={(v) => onChange({ wordWrap: v })}
          label="Word wrap"
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
        <Toggle
          checked={settings.fontLigatures}
          onChange={(v) => onChange({ fontLigatures: v })}
          label="Font ligatures"
        />
      </Row>
      <Row query={query} label="Sticky scroll" desc="Pin the enclosing scope (function/class) to the top.">
        <Toggle
          checked={settings.stickyScroll}
          onChange={(v) => onChange({ stickyScroll: v })}
          label="Sticky scroll"
        />
      </Row>
      <Row
        query={query}
        label="Bracket pair colorization"
        desc="Colour matching brackets so nesting is easy to follow."
      >
        <Toggle
          checked={settings.bracketColorization}
          onChange={(v) => onChange({ bracketColorization: v })}
          label="Bracket pair colorization"
        />
      </Row>
      <Row query={query} label="Smooth scrolling" desc="Animate scrolling instead of jumping.">
        <Toggle
          checked={settings.smoothScrolling}
          onChange={(v) => onChange({ smoothScrolling: v })}
          label="Smooth scrolling"
        />
      </Row>
      <Row
        query={query}
        label="Scroll beyond last line"
        desc="Allow scrolling past the final line of the file."
      >
        <Toggle
          checked={settings.scrollBeyondLastLine}
          onChange={(v) => onChange({ scrollBeyondLastLine: v })}
          label="Scroll beyond last line"
        />
      </Row>
      <Row query={query} label="Minimap" desc="Show the code minimap on the right.">
        <Toggle
          checked={settings.minimap}
          onChange={(v) => onChange({ minimap: v })}
          label="Minimap"
        />
      </Row>
      <Row query={query} label="Format on save" desc="Run the language formatter when you save a file.">
        <Toggle
          checked={settings.formatOnSave}
          onChange={(v) => onChange({ formatOnSave: v })}
          label="Format on save"
        />
      </Row>
      <Row
        query={query}
        label="Trim trailing whitespace on save"
        desc="Remove spaces/tabs at the end of each line when saving."
      >
        <Toggle
          checked={settings.trimTrailingWhitespace}
          onChange={(v) => onChange({ trimTrailingWhitespace: v })}
          label="Trim trailing whitespace on save"
        />
      </Row>
      <Row
        query={query}
        label="Insert final newline on save"
        desc="Ensure files end with a single newline."
      >
        <Toggle
          checked={settings.insertFinalNewline}
          onChange={(v) => onChange({ insertFinalNewline: v })}
          label="Insert final newline on save"
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
        <Toggle
          checked={settings.autoSave}
          onChange={(v) => onChange({ autoSave: v })}
          label="Auto save"
        />
      </Row>
      <Row
        query={query}
        label="Reopen last folder on startup"
        desc="Open the most recent folder (and its tabs) on launch instead of the welcome screen."
      >
        <Toggle
          checked={settings.restoreLastFolder}
          onChange={(v) => onChange({ restoreLastFolder: v })}
          label="Reopen last folder on startup"
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
  );
}
