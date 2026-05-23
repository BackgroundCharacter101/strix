import { useEffect, useState } from 'react';

export interface FileContentsState {
  content: string | null;
  loading: boolean;
  error: string | null;
}

export function useFileContents(path: string | null): FileContentsState {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setContent(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    window.strix.fs
      .read(path)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return { content, loading, error };
}
