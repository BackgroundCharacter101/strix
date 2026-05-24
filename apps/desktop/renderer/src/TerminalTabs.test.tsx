// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Stub the xterm-backed Terminal; we're testing tab management, not rendering.
vi.mock('./Terminal', () => ({ Terminal: () => <div data-testid="terminal" /> }));

import { TerminalTabs } from './TerminalTabs';

describe('TerminalTabs', () => {
  it('starts with a single terminal tab', () => {
    render(<TerminalTabs />);
    expect(screen.getAllByTestId('terminal')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('adds a new tab and makes it active', () => {
    render(<TerminalTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'new terminal' }));

    expect(screen.getAllByTestId('terminal')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Terminal 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('switches the active tab when a tab is clicked', () => {
    render(<TerminalTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'new terminal' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal 1' }));

    expect(screen.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('closes a tab and falls back to a remaining tab', () => {
    render(<TerminalTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'new terminal' })); // Terminal 2 active

    fireEvent.click(screen.getByRole('button', { name: 'close terminal 2' }));

    expect(screen.getAllByTestId('terminal')).toHaveLength(1);
    expect(screen.queryByRole('tab', { name: 'Terminal 2' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
