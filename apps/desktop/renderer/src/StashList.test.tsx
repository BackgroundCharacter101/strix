// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StashList, parseStashLabel } from './StashList';

describe('parseStashLabel', () => {
  it('splits the branch out of a custom stash message', () => {
    expect(parseStashLabel('On main: Before switching to feature/greeting')).toEqual({
      text: 'Before switching to feature/greeting',
      branch: 'main',
      wip: false,
    });
  });

  it('strips the WIP prefix and the leading commit sha', () => {
    expect(parseStashLabel('WIP on feat/x: 1a2b3c4 Add the thing')).toEqual({
      text: 'Add the thing',
      branch: 'feat/x',
      wip: true,
    });
  });

  it('passes through a message that does not match git formatting', () => {
    expect(parseStashLabel('something else')).toEqual({
      text: 'something else',
      branch: null,
      wip: false,
    });
  });
});

describe('StashList', () => {
  const stashes = [
    { ref: 'stash@{0}', message: 'On main: Before switching to feature/greeting', date: Date.now() },
  ];

  it('renders nothing when there are no stashes', () => {
    const { container } = render(<StashList stashes={[]} busy={false} onAct={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the message and branch metadata separately', () => {
    render(<StashList stashes={stashes} busy={false} onAct={vi.fn()} />);
    expect(screen.getByText('Before switching to feature/greeting')).toBeInTheDocument();
    expect(screen.getByText(/main/)).toBeInTheDocument();
  });

  it('calls onAct with the entry ref', () => {
    const onAct = vi.fn();
    render(<StashList stashes={stashes} busy={false} onAct={onAct} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pop' }));
    expect(onAct).toHaveBeenCalledWith('pop', 'stash@{0}');
  });

  it('disables the actions while a git operation is running', () => {
    render(<StashList stashes={stashes} busy onAct={vi.fn()} />);
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });
});
