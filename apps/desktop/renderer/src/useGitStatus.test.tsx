// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGitStatusState } from './useGitStatus';
import { makeStrixApi } from '../test-utils';
import type { GitStatus } from '../../main/git';

const STATUS: GitStatus = { isRepo: true, branch: 'main', files: [], ahead: 0, behind: 0 } as GitStatus;

let changedCb: (paths: string[]) => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  changedCb = () => {};
  window.strix = makeStrixApi({
    git: { status: vi.fn(async () => STATUS) },
    fs: {
      onChanged: vi.fn((cb) => {
        changedCb = cb;
        return () => {};
      }),
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useGitStatusState', () => {
  it('loads once on mount and does NOT re-run on a fast blind interval', async () => {
    renderHook(() => useGitStatusState('/ws'));
    await vi.advanceTimersByTimeAsync(0);
    expect(window.strix.git.status).toHaveBeenCalledTimes(1);

    // The old code re-ran statusMatrix every 4s. Advance well past that with no
    // real signal — it must NOT poll (this is the CPU fix).
    await vi.advanceTimersByTimeAsync(12_000);
    expect(window.strix.git.status).toHaveBeenCalledTimes(1);
  });

  it('refreshes (debounced) when files change', async () => {
    renderHook(() => useGitStatusState('/ws'));
    await vi.advanceTimersByTimeAsync(0);
    expect(window.strix.git.status).toHaveBeenCalledTimes(1);

    // A burst of file-change events collapses to a single refresh after debounce.
    changedCb(['/ws/a.ts']);
    changedCb(['/ws/b.ts']);
    changedCb(['/ws/c.ts']);
    await vi.advanceTimersByTimeAsync(800);
    expect(window.strix.git.status).toHaveBeenCalledTimes(2);
  });

  it('runs the slow safety net but skips it while the window is hidden', async () => {
    renderHook(() => useGitStatusState('/ws'));
    await vi.advanceTimersByTimeAsync(0);
    expect(window.strix.git.status).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(window.strix.git.status).toHaveBeenCalledTimes(1); // skipped while hidden

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(window.strix.git.status).toHaveBeenCalledTimes(2); // runs when visible
  });
});
