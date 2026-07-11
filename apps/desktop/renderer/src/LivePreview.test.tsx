// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LivePreview } from './LivePreview';
import { makeStrixApi } from '../test-utils';

beforeEach(() => {
  window.strix = makeStrixApi();
});

describe('LivePreview', () => {
  it('detects the dev script, starts it, and embeds the URL when it arrives', async () => {
    let urlCb: (u: string) => void = () => {};
    const start = vi.fn(async () => ({ running: true, url: null, command: 'npm run dev', root: '/ws' }));
    window.strix = makeStrixApi({
      fs: { read: vi.fn(async () => JSON.stringify({ scripts: { dev: 'vite', build: 'vite build' } })) },
      preview: {
        start,
        onUrl: vi.fn((cb) => {
          urlCb = cb;
          return () => {};
        }),
      },
    });
    const { container } = render(<LivePreview workspaceKey="/ws" onClose={() => {}} />);

    await waitFor(() => expect(start).toHaveBeenCalledWith('npm run dev'));
    // No URL yet → starting status, no webview.
    expect(container.querySelector('webview')).toBeNull();

    urlCb('http://localhost:5173/');
    await waitFor(() => expect(container.querySelector('webview')).not.toBeNull());
    expect(container.querySelector('webview')?.getAttribute('src')).toBe('http://localhost:5173/');
  });

  it('Stop and Open-in-browser call the bridge', async () => {
    let urlCb: (u: string) => void = () => {};
    const stop = vi.fn(async () => {});
    window.strix = makeStrixApi({
      fs: { read: vi.fn(async () => JSON.stringify({ scripts: { dev: 'vite' } })) },
      preview: {
        start: vi.fn(async () => ({ running: true, url: null, command: 'npm run dev', root: '/ws' })),
        stop,
        onUrl: vi.fn((cb) => {
          urlCb = cb;
          return () => {};
        }),
      },
    });
    render(<LivePreview workspaceKey="/ws" onClose={() => {}} />);
    await waitFor(() => expect(window.strix.preview.start).toHaveBeenCalled());
    urlCb('http://localhost:3000/');
    await screen.findByTitle('Open in browser');

    fireEvent.click(screen.getByTitle('Open in browser'));
    expect(window.strix.win.openExternal).toHaveBeenCalledWith('http://localhost:3000/');
    fireEvent.click(screen.getByTitle('Stop the dev server'));
    expect(stop).toHaveBeenCalled();
  });

  it('falls back to the static host when there is no dev script', async () => {
    const serveStart = vi.fn(async () => ({ url: 'http://127.0.0.1:5500', port: 5500, root: '/ws' }));
    window.strix = makeStrixApi({
      // No package.json → read rejects → static fallback.
      fs: { read: vi.fn(async () => Promise.reject(new Error('ENOENT'))) },
      serve: { start: serveStart, stop: vi.fn(async () => {}), info: vi.fn(async () => null) },
    });
    const { container } = render(<LivePreview workspaceKey="/ws" onClose={() => {}} />);
    await waitFor(() => expect(serveStart).toHaveBeenCalledWith('/ws'));
    await waitFor(() =>
      expect(container.querySelector('webview')?.getAttribute('src')).toBe('http://127.0.0.1:5500'),
    );
    expect(window.strix.preview.start).not.toHaveBeenCalled();
  });
});
