import { useCallback, useRef, useState } from 'react';
import type { FileBuffer } from './useFileBuffer';

interface Buf {
  draft: string;
  saved: string;
  loading: boolean;
  error: string | null;
}

export interface EditorTabsApi {
  tabs: string[];
  activePath: string | null;
  active: FileBuffer | null;
  isDirty(path: string): boolean;
  open(path: string): void;
  activate(path: string): void;
  close(path: string): void;
}

// Manages the set of open files, the active tab, and a per-path buffer
// (draft/saved) so unsaved edits survive switching between tabs.
export function useEditorTabs(): EditorTabsApi {
  const [tabs, setTabs] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [bufs, setBufs] = useState<Record<string, Buf>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loaded = useRef<Set<string>>(new Set());

  const open = useCallback((path: string) => {
    setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActivePath(path);
    if (loaded.current.has(path)) {
      return;
    }
    loaded.current.add(path);
    setBufs((prev) => ({ ...prev, [path]: { draft: '', saved: '', loading: true, error: null } }));
    window.strix.fs
      .read(path)
      .then((text) =>
        setBufs((prev) => ({
          ...prev,
          [path]: { draft: text, saved: text, loading: false, error: null },
        })),
      )
      .catch((e: unknown) =>
        setBufs((prev) => ({
          ...prev,
          [path]: {
            draft: '',
            saved: '',
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          },
        })),
      );
  }, []);

  const activate = useCallback((path: string) => setActivePath(path), []);

  const close = useCallback((path: string) => {
    loaded.current.delete(path);
    setBufs((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setTabs((prev) => {
      const next = prev.filter((p) => p !== path);
      setActivePath((cur) => (cur === path ? (next[next.length - 1] ?? null) : cur));
      return next;
    });
  }, []);

  const setDraft = useCallback(
    (value: string) => {
      if (!activePath) return;
      setBufs((prev) => ({ ...prev, [activePath]: { ...prev[activePath], draft: value } }));
    },
    [activePath],
  );

  const save = useCallback(async () => {
    if (!activePath) return;
    const buf = bufs[activePath];
    if (!buf) return;
    setSaving(true);
    setSaveError(null);
    try {
      await window.strix.fs.write(activePath, buf.draft);
      setBufs((prev) => ({ ...prev, [activePath]: { ...prev[activePath], saved: buf.draft } }));
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [activePath, bufs]);

  const isDirty = useCallback(
    (path: string) => {
      const buf = bufs[path];
      return buf ? buf.draft !== buf.saved : false;
    },
    [bufs],
  );

  const current = activePath ? bufs[activePath] : undefined;
  const active: FileBuffer | null = activePath
    ? {
        draft: current?.draft ?? '',
        setDraft,
        loading: current?.loading ?? true,
        error: current?.error ?? null,
        dirty: current ? current.draft !== current.saved : false,
        saving,
        saveError,
        save,
      }
    : null;

  return { tabs, activePath, active, isDirty, open, activate, close };
}
