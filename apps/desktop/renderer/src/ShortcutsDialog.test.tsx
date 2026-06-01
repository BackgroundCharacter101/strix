// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutsDialog } from './ShortcutsDialog';

describe('ShortcutsDialog', () => {
  it('lists grouped shortcuts with keycaps', () => {
    const { container } = render(<ShortcutsDialog onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Command Palette')).toBeInTheDocument();
    expect(screen.getByText('Toggle Terminal')).toBeInTheDocument();
    // Keybindings render as <kbd> chips.
    expect(container.querySelectorAll('kbd').length).toBeGreaterThan(5);
  });

  it('filters by label or keys', () => {
    render(<ShortcutsDialog onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Filter shortcuts'), { target: { value: 'terminal' } });
    expect(screen.getByText('Toggle Terminal')).toBeInTheDocument();
    expect(screen.queryByText('Command Palette')).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', () => {
    render(<ShortcutsDialog onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Filter shortcuts'), { target: { value: 'zzzzz' } });
    expect(screen.getByText('No matching shortcuts')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
