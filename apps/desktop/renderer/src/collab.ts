import type * as Monaco from 'monaco-editor';

const COLORS = [
  '#e57373',
  '#64b5f6',
  '#81c784',
  '#ffb74d',
  '#ba68c8',
  '#4db6ac',
  '#f06292',
  '#a1887f',
];

// Deterministic presence color from a seed (e.g. user id / file path).
export function pickUserColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return COLORS[h % COLORS.length];
}

// A stable collaboration room id for a file path.
export function roomForPath(path: string): string {
  return path.replace(/[\\/]+/g, '__').replace(/[^a-zA-Z0-9_.-]/g, '') || 'untitled';
}

export interface CollabUser {
  name: string;
  color: string;
}

export interface ConnectCollabOptions {
  url: string;
  room: string;
  model: Monaco.editor.ITextModel;
  editor: Monaco.editor.IStandaloneCodeEditor;
  user: CollabUser;
}

// Bind the editor to a shared Yjs document over y-websocket, with awareness
// (remote cursors/selections rendered by y-monaco). Yjs libs are imported
// lazily so they only load when collaboration is actually enabled. Returns a
// synchronous disposer; setup is async but dispose is always safe.
export function connectCollab(opts: ConnectCollabOptions): () => void {
  let cleanup: (() => void) | null = null;
  let disposed = false;

  void (async () => {
    const Y = await import('yjs');
    const { WebsocketProvider } = await import('y-websocket');
    const { MonacoBinding } = await import('y-monaco');
    if (disposed) return;

    const doc = new Y.Doc();
    const provider = new WebsocketProvider(opts.url, opts.room, doc);
    provider.awareness.setLocalStateField('user', opts.user);
    const binding = new MonacoBinding(
      doc.getText('monaco'),
      opts.model,
      new Set([opts.editor]),
      provider.awareness,
    );

    cleanup = () => {
      binding.destroy();
      provider.destroy();
      doc.destroy();
    };
  })();

  return () => {
    disposed = true;
    cleanup?.();
  };
}
