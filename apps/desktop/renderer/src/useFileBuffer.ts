import { useCallback, useEffect, useState } from 'react';
import { useFileContents } from './useFileContents';

export interface FileBuffer {
  draft: string;
  setDraft: (value: string) => void;
  loading: boolean;
  error: string | null;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  save: (value?: string) => Promise<void>;
}

// Owns the editable buffer for a file: loads on-disk content, tracks the live
// draft (so other panes can read unsaved edits), and persists via fs.write.
export function useFileBuffer(path: string | null): FileBuffer {
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

  const dirty = draft !== saved;

  const save = useCallback(
    async (valueOverride?: string) => {
      if (!path) {
        return;
      }
      const text = valueOverride ?? draft;
      setSaving(true);
      setSaveError(null);
      try {
        await window.strix.fs.write(path, text);
        setDraft(text);
        setSaved(text);
      } catch (e: unknown) {
        setSaveError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [path, draft],
  );

  return { draft, setDraft, loading, error, dirty, saving, saveError, save };
}
