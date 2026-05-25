import { useCallback, useRef, useState } from 'react';

export type ResizeAxis = 'x' | 'y';

export interface ResizableOptions {
  axis: ResizeAxis;
  /** +1: size grows as the pointer moves right/down; -1: the opposite. */
  direction?: 1 | -1;
  min?: number;
  max?: number;
}

export interface Resizable {
  size: number;
  onPointerDown: (e: { clientX: number; clientY: number; preventDefault: () => void }) => void;
}

// Drag-to-resize: returns the current size and a pointer-down handler for a
// divider element. While dragging, it tracks pointer movement on the window
// and clamps the size to [min, max].
export function useResizable(initial: number, opts: ResizableOptions): Resizable {
  const { axis, direction = 1, min = 0, max = Number.POSITIVE_INFINITY } = opts;
  const [size, setSize] = useState(initial);
  const sizeRef = useRef(initial);

  const apply = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(min, next));
      sizeRef.current = clamped;
      setSize(clamped);
    },
    [min, max],
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
