import { useEffect, useRef } from 'react';

// Close an open popup on Escape or a click outside it. Every menu in a panel
// should dismiss the same way — the Source Control panel briefly shipped a
// branch menu that did and an overflow menu that did not, which reads as the
// overflow menu being stuck open.
//
// Returns the ref to put on the popup's wrapper element (the element that
// contains BOTH the trigger and the popup, so clicking the trigger to toggle
// does not register as an "outside" click and fight the toggle).
export function useDismiss<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onDismiss: () => void,
): React.RefObject<T | null> {
  const wrapRef = useRef<T | null>(null);
  // Hold the latest callback in a ref so a caller passing a fresh closure each
  // render does not resubscribe the listeners on every render.
  const cbRef = useRef(onDismiss);
  cbRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cbRef.current();
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) cbRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return wrapRef;
}
