// A tiny module-level toast store so any code can raise a notification without
// threading a context through the tree. Components subscribe via subscribeToasts.
export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

type Listener = (toasts: Toast[]) => void;

const listeners = new Set<Listener>();
let toasts: Toast[] = [];
let seq = 0;

function emit() {
  for (const l of listeners) l(toasts);
}

export function showToast(message: string, kind: ToastKind = 'info', timeoutMs = 4000): number {
  const id = ++seq;
  toasts = [...toasts, { id, message, kind }];
  emit();
  if (timeoutMs > 0) {
    setTimeout(() => dismissToast(id), timeoutMs);
  }
  return id;
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(cb: Listener): () => void {
  listeners.add(cb);
  cb(toasts);
  return () => listeners.delete(cb);
}
