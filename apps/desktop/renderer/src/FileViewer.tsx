import React, { useEffect, useState } from 'react';
import { CodeEditor, languageForPath } from '@strix/editor';
import { useFileContents } from './useFileContents';

export function FileViewer({ path }: { path: string | null }) {
  const { content, loading, error } = useFileContents(path);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const text = content ?? '';
    setDraft(text);
    setSaved(text);
  }, [content]);

  if (!path) {
    return <p>No file selected</p>;
  }
  if (loading) {
    return <div role="status">Loading…</div>;
  }
  if (error) {
    return <div role="alert">{error}</div>;
  }

  const dirty = draft !== saved;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await window.strix.fs.write(path, draft);
      setSaved(draft);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ height: 400 }}>
        <CodeEditor value={draft} language={languageForPath(path)} onChange={setDraft} />
      </div>
      <button type="button" onClick={save} disabled={!dirty || saving}>
        Save
      </button>
      {dirty && <span aria-label="unsaved changes">●</span>}
      {saveError && <span role="alert">{saveError}</span>}
    </div>
  );
}
