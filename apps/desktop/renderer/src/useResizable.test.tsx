// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useResizable } from './useResizable';

const down = { clientX: 0, clientY: 0, preventDefault: () => {} };

function move(coords: { clientX?: number; clientY?: number }) {
  window.dispatchEvent(new MouseEvent('pointermove', coords));
}

describe('useResizable', () => {
  it('grows with the pointer on the x axis and clamps to max', () => {
    const { result } = renderHook(() => useResizable(200, { axis: 'x', min: 100, max: 400 }));
    expect(result.current.size).toBe(200);

    act(() => result.current.onPointerDown(down));
    act(() => move({ clientX: 50 }));
    expect(result.current.size).toBe(250);

    act(() => move({ clientX: 1000 }));
    expect(result.current.size).toBe(400); // clamped to max
  });

  it('inverts with direction: -1 and clamps to min', () => {
    const { result } = renderHook(() =>
      useResizable(300, { axis: 'x', direction: -1, min: 150, max: 500 }),
    );

    act(() => result.current.onPointerDown(down));
    act(() => move({ clientX: 100 })); // pointer right => size shrinks
    expect(result.current.size).toBe(200);

    act(() => move({ clientX: 1000 }));
    expect(result.current.size).toBe(150); // clamped to min
  });

  it('stops responding after pointer up', () => {
    const { result } = renderHook(() => useResizable(200, { axis: 'y', min: 0, max: 1000 }));

    act(() => result.current.onPointerDown(down));
    act(() => move({ clientY: 40 }));
    expect(result.current.size).toBe(240);

    act(() => window.dispatchEvent(new MouseEvent('pointerup')));
    act(() => move({ clientY: 500 }));
    expect(result.current.size).toBe(240); // unchanged after release
  });
});
