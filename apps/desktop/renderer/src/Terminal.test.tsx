// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { makeStrixApi } from '../test-utils';

// xterm needs real DOM/canvas; stub it and capture the wiring.
const xterm = vi.hoisted(() => ({
  writes: [] as string[],
  keyHandlers: [] as ((data: string) => void)[],
  disposed: false,
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    loadAddon() {}
    open() {}
    write(data: string) {
      xterm.writes.push(data);
    }
    onData(cb: (data: string) => void) {
      xterm.keyHandlers.push(cb);
      return { dispose: () => {} };
    }
    dispose() {
      xterm.disposed = true;
    }
  },
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));

import { Terminal } from './Terminal';

const create = vi.fn<[unknown?], Promise<string>>();
const input = vi.fn();
const kill = vi.fn();
let emitData: (e: { id: string; data: string }) => void = () => {};
const offData = vi.fn();

beforeEach(() => {
  xterm.writes.length = 0;
  xterm.keyHandlers.length = 0;
  xterm.disposed = false;
  create.mockReset().mockResolvedValue('term-1');
  input.mockReset();
  kill.mockReset();
  offData.mockReset();
  const onData = vi.fn((cb: (e: { id: string; data: string }) => void) => {
    emitData = cb;
    return offData;
  });
  window.strix = makeStrixApi({ terminal: { create, input, kill, onData } });
});

describe('Terminal', () => {
  it('creates a PTY session on mount', async () => {
    render(<Terminal />);
    expect(screen.getByLabelText('terminal')).toBeInTheDocument();
    await waitFor(() => expect(create).toHaveBeenCalled());
  });

  it('writes PTY output for its own session into the terminal', async () => {
    render(<Terminal />);
    await waitFor(() => expect(create).toHaveBeenCalled());

    emitData({ id: 'term-1', data: 'hello' });
    emitData({ id: 'other', data: 'ignored' });

    expect(xterm.writes).toContain('hello');
    expect(xterm.writes).not.toContain('ignored');
  });

  it('forwards keystrokes to the PTY', async () => {
    render(<Terminal />);
    await waitFor(() => expect(create).toHaveBeenCalled());

    xterm.keyHandlers.forEach((cb) => cb('ls\r'));
    expect(input).toHaveBeenCalledWith('term-1', 'ls\r');
  });

  it('resizes the PTY when the window resizes', async () => {
    render(<Terminal />);
    await waitFor(() => expect(create).toHaveBeenCalled());

    window.dispatchEvent(new Event('resize'));
    expect(input).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
    // 80x24 come from the stubbed xterm instance.
    await waitFor(() => expect(window.strix.terminal.resize).toHaveBeenCalledWith('term-1', 80, 24));
  });

  it('coalesces a burst of resizes (a drag) into a single PTY resize', async () => {
    render(<Terminal />);
    await waitFor(() => expect(create).toHaveBeenCalled());

    // A resize drag fires many events in quick succession; the trailing debounce
    // must collapse them to ONE ConPTY resize so the TUI doesn't smear mid-drag.
    for (let i = 0; i < 6; i++) window.dispatchEvent(new Event('resize'));
    await waitFor(() => expect(window.strix.terminal.resize).toHaveBeenCalled());
    expect(window.strix.terminal.resize).toHaveBeenCalledTimes(1);
  });

  it('kills the session and disposes the terminal on unmount', async () => {
    const { unmount } = render(<Terminal />);
    await waitFor(() => expect(create).toHaveBeenCalled());

    unmount();
    expect(kill).toHaveBeenCalledWith('term-1');
    expect(offData).toHaveBeenCalled();
    expect(xterm.disposed).toBe(true);
  });
});
