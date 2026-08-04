import React, { useEffect, useState } from 'react';
import { CodeEditor } from '@strix/editor';
import type { Settings } from './useSettings';

// The JSON view is DERIVED from settings state, never a second source of truth:
// the GUI writes state, this renders from it, and an edit here must parse and
// validate before it is applied. Invalid JSON is reported and applied nowhere,
// so a half-typed brace can never wipe someone's configuration.
export function SettingsJson({
  settings,
  onApply,
}: {
  settings: Settings;
  onApply: (patch: Partial<Settings>) => void;
}) {
  const serialised = JSON.stringify(settings, null, 2);
  const [draft, setDraft] = useState(serialised);
  const [error, setError] = useState<string | null>(null);

  // Follow changes made in the GUI while this view is open, unless the user is
  // mid-edit with something that does not parse (clobbering that would be rude).
  useEffect(() => {
    if (!error) setDraft(serialised);
  }, [serialised]);

  const onChange = (text: string) => {
    setDraft(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Settings must be a JSON object.');
      return;
    }
    setError(null);
    onApply(parsed as Partial<Settings>);
  };

  return (
    <div className="settings-json">
      <p className="settings-json-hint">
        Every setting, as stored. Changes apply as soon as the JSON is valid.
      </p>
      <div className="settings-json-editor">
        <CodeEditor value={draft} language="json" onChange={onChange} />
      </div>
      {error && (
        <p className="settings-json-error" role="alert">
          {error} — nothing was applied.
        </p>
      )}
    </div>
  );
}
