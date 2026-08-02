// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BranchMenu } from './BranchMenu';

const props = {
  current: 'main',
  branches: ['main', 'feature/greeting'],
  busy: false,
  onSwitch: vi.fn(),
  onCreate: vi.fn(),
};

describe('BranchMenu', () => {
  it('shows the current branch on the trigger', () => {
    render(<BranchMenu {...props} />);
    expect(screen.getByRole('button', { name: 'Branch: main' })).toBeInTheDocument();
  });

  it('lists branches once opened and switches on click', () => {
    const onSwitch = vi.fn();
    render(<BranchMenu {...props} onSwitch={onSwitch} />);
    // Closed to begin with — the list is not in the document.
    expect(screen.queryByRole('menuitem', { name: 'feature/greeting' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Branch: main' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'feature/greeting' }));
    expect(onSwitch).toHaveBeenCalledWith('feature/greeting');
  });

  it('creates a branch from the inline field', () => {
    const onCreate = vi.fn();
    render(<BranchMenu {...props} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Branch: main' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New branch…' }));
    const field = screen.getByLabelText('New branch name');
    fireEvent.change(field, { target: { value: 'feat/x' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCreate).toHaveBeenCalledWith('feat/x');
  });

  it('closes on Escape', () => {
    render(<BranchMenu {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Branch: main' }));
    expect(screen.getByRole('menuitem', { name: 'feature/greeting' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menuitem', { name: 'feature/greeting' })).toBeNull();
  });

  it('reads as detached HEAD when there is no branch', () => {
    render(<BranchMenu {...props} current={null} />);
    expect(screen.getByRole('button', { name: 'Branch: detached HEAD' })).toBeInTheDocument();
  });
});
