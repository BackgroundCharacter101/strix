// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { freellmComplete } from './aiComplete';
import { makeStrixApi } from '../test-utils';

describe('freellmComplete', () => {
  beforeEach(() => {
    window.strix = makeStrixApi();
  });

  it('routes through the main-process freellm IPC and accumulates tokens', async () => {
    let tokenCb: (p: { id: number; token: string }) => void = () => {};
    let doneCb: (p: { id: number }) => void = () => {};
    window.strix = makeStrixApi({
      ai: {
        onFreellmToken: vi.fn((cb) => {
          tokenCb = cb;
          return () => {};
        }),
        onFreellmDone: vi.fn((cb) => {
          doneCb = cb;
          return () => {};
        }),
        freellmStart: vi.fn((id: number) => {
          // Simulate the main process streaming a reply for this id.
          queueMicrotask(() => {
            tokenCb({ id, token: 'feat: ' });
            tokenCb({ id, token: 'add thing' });
            doneCb({ id });
          });
        }),
      },
    });

    const text = await freellmComplete({
      serverUrl: '',
      model: 'auto',
      messages: [{ role: 'user', content: 'diff' }],
    });
    expect(text).toBe('feat: add thing');
    expect(window.strix.ai.freellmStart).toHaveBeenCalled();
  });

  it('rejects when the main process reports an error', async () => {
    let errCb: (p: { id: number; error?: string }) => void = () => {};
    window.strix = makeStrixApi({
      ai: {
        onFreellmError: vi.fn((cb) => {
          errCb = cb;
          return () => {};
        }),
        freellmStart: vi.fn((id: number) => {
          queueMicrotask(() => errCb({ id, error: 'no key' }));
        }),
      },
    });
    await expect(freellmComplete({ serverUrl: '', model: 'auto', messages: [] })).rejects.toThrow(/no key/);
  });
});
