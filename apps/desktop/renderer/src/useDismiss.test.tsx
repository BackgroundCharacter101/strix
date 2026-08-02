// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { useDismiss } from './useDismiss';

// A minimal popup built the way the real menus are: one wrapper holding BOTH
// the trigger and the popup.
function Popup({ onDismiss }: { onDismiss?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => {
    setOpen(false);
    onDismiss?.();
  });
  return (
    <div>
      <div ref={ref}>
        <button type="button" onClick={() => setOpen((v) => !v)}>
          trigger
        </button>
        {open && <div role="menu">menu body</div>}
      </div>
      <button type="button">outside</button>
    </div>
  );
}

const openIt = () => fireEvent.click(screen.getByRole('button', { name: 'trigger' }));

describe('useDismiss', () => {
  it('closes on Escape', () => {
    render(<Popup />);
    openIt();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on a click outside the wrapper', () => {
    render(<Popup />);
    openIt();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not close when clicking inside the popup', () => {
    render(<Popup />);
    openIt();
    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('does not fire while closed', () => {
    const onDismiss = vi.fn();
    render(<Popup onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('removes its listeners once closed', () => {
    const onDismiss = vi.fn();
    render(<Popup onDismiss={onDismiss} />);
    openIt();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Closed again: a second Escape must not reach a leaked listener.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
