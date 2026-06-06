import { useCallback, useRef, useState } from 'react';

export type ResizeAxis = 'x' | 'y';

export interface ResizableOptions {
  axis: ResizeAxis;
  /** +1: size grows as the pointer moves right/down; -1: the opposite. */
  direction?: 1 | -1;
  min?: number;
  max?: number;
  /** localStorage key to persist the size across restarts. */
  persistKey?: string;
}

function readStored(key: string | undefined, fallback: number): number {
  if (!key) return fallback;
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export interface Resizable {
  size: number;
  onPointerDown: (e: { clientX: number; clientY: number; preventDefault: () => void }) => void;
}

// Drag-to-resize: returns the current size and a pointer-down handler for a
// divider element. While dragging, it tracks pointer movement on the window
// and clamps the size to [min, max].
export function useResizable(initial: number, opts: ResizableOptions): Resizable {
  const { axis, direction = 1, min = 0, max = Number.POSITIVE_INFINITY, persistKey } = opts;
  const start = readStored(persistKey, initial);
  const [size, setSize] = useState(start);
  const sizeRef = useRef(start);

  const apply = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(min, next));
      sizeRef.current = clamped;
      setSize(clamped);
      if (persistKey) {
        try {
          localStorage.setItem(persistKey, String(clamped));
        } catch {
          /* ignore quota/availability */
        }
      }
    },
    [min, max, persistKey],
  );

  const onPointerDown = useCallback(
    (e: { clientX: number; clientY: number; preventDefault: () => void }) => {
      e.preventDefault();
      const start = axis === 'x' ? e.clientX : e.clientY;
      const startSize = sizeRef.current;

      const move = (ev: MouseEvent) => {
        const cur = axis === 'x' ? ev.clientX : ev.clientY;
        apply(startSize + (cur - start) * direction);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [axis, direction, apply],
  );

  return { size, onPointerDown };
}
