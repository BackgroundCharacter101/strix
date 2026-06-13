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
  /** Re-read an open file from disk (skips if not open or has unsaved edits). */
  reload(path: string): void;
  saveAll(): Promise<void>;
  /** Replace the whole open set (used to restore a project's saved session). */
  replaceAll(paths: string[], active: string | null): void;
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

  // Re-read a file changed on disk (e.g. by an AI agent). Only updates an open
  // buffer that has NO unsaved edits, so a live draft is never clobbered.
  const reload = useCallback((path: string) => {
    if (!loaded.current.has(path)) return;
    window.strix.fs
      .read(path)
      .then((text) =>
        setBufs((prev) => {
          const buf = prev[path];
          if (!buf || buf.draft !== buf.saved) return prev;
          if (buf.draft === text) return prev;
          return { ...prev, [path]: { draft: text, saved: text, loading: false, error: null } };
        }),
      )
      .catch(() => {
        /* file may have been deleted; leave the buffer as-is */
      });
  }, []);

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

  const save = useCallback(
    async (valueOverride?: string) => {
      if (!activePath) return;
      const buf = bufs[activePath];
      if (!buf) return;
      // An override (e.g. format-on-save) writes that exact text and syncs the
      // buffer to it, avoiding any stale-draft race.
      const text = valueOverride ?? buf.draft;
      setSaving(true);
      setSaveError(null);
      try {
        await window.strix.fs.write(activePath, text);
        setBufs((prev) => ({
          ...prev,
          [activePath]: { ...prev[activePath], draft: text, saved: text },
        }));
      } catch (e: unknown) {
        setSaveError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [activePath, bufs],
  );

  const saveAll = useCallback(async () => {
    const dirtyEntries = Object.entries(bufs).filter(([, b]) => b.draft !== b.saved);
    if (dirtyEntries.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await Promise.all(dirtyEntries.map(([path, b]) => window.strix.fs.write(path, b.draft)));
      setBufs((prev) => {
        const next = { ...prev };
        for (const [path, b] of dirtyEntries) {
          if (next[path]) next[path] = { ...next[path], saved: b.draft };
        }
        return next;
      });
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [bufs]);

  // Replace the entire open set (restore a saved session). Clears existing
  // buffers, then opens each path (which loads its content) and activates one.
  const replaceAll = useCallback(
    (paths: string[], active: string | null) => {
      loaded.current = new Set();
      setBufs({});
      setTabs(paths);
      setActivePath(active ?? paths[paths.length - 1] ?? null);
      for (const p of paths) {
        if (loaded.current.has(p)) continue;
        loaded.current.add(p);
        setBufs((prev) => ({ ...prev, [p]: { draft: '', saved: '', loading: true, error: null } }));
        window.strix.fs
          .read(p)
          .then((text) =>
            setBufs((prev) => ({
              ...prev,
              [p]: { draft: text, saved: text, loading: false, error: null },
            })),
          )
          .catch((e: unknown) =>
            setBufs((prev) => ({
              ...prev,
              [p]: {
                draft: '',
                saved: '',
                loading: false,
                error: e instanceof Error ? e.message : String(e),
              },
            })),
          );
      }
    },
    [],
  );

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

  return { tabs, activePath, active, isDirty, open, activate, close, reload, saveAll, replaceAll };
}
