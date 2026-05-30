// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Stub the xterm-backed Terminal; we're testing tab management, not rendering.
vi.mock('./Terminal', () => ({
  Terminal: ({ bootCommand, notice }: { bootCommand?: string; notice?: string }) => (
    <div data-testid="terminal" data-boot={bootCommand} data-notice={notice} />
  ),
}));

import { TerminalTabs } from './TerminalTabs';
import { makeStrixApi } from '../test-utils';

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

  it('launches a Claude Code tab that boots `claude` when installed', async () => {
    const hasCommand = vi.fn(async () => true);
    window.strix = makeStrixApi({ terminal: { hasCommand } });
    render(<TerminalTabs />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Claude Code' }));

    expect(await screen.findByRole('tab', { name: 'Claude Code' })).toBeInTheDocument();
    await waitFor(() => {
      const claudeSlot = screen.getAllByTestId('terminal').find((t) => t.dataset.boot === 'claude');
      expect(claudeSlot).toBeTruthy();
    });
    expect(hasCommand).toHaveBeenCalledWith('claude');
  });

  it('shows an install hint when Claude Code is not on PATH', async () => {
    window.strix = makeStrixApi({ terminal: { hasCommand: vi.fn(async () => false) } });
    render(<TerminalTabs />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Claude Code' }));

    await screen.findByRole('tab', { name: 'Claude Code' });
    await waitFor(() => {
      const slot = screen.getAllByTestId('terminal').find((t) => t.dataset.notice?.includes('npm install'));
      expect(slot).toBeTruthy();
    });
  });

  it('closes a tab and falls back to a remaining tab', () => {
    render(<TerminalTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'new terminal' })); // Terminal 2 active

    fireEvent.click(screen.getByRole('button', { name: 'close Terminal 2' }));

    expect(screen.getAllByTestId('terminal')).toHaveLength(1);
    expect(screen.queryByRole('tab', { name: 'Terminal 2' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
