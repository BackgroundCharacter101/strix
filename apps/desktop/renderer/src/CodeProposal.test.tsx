// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@strix/editor', () => ({
  languageForPath: () => 'typescript',
  DiffViewer: ({ original, modified }: { original: string; modified: string }) => (
    <div aria-label="diff" data-original={original} data-modified={modified} />
  ),
}));

import { CodeProposal } from './CodeProposal';

describe('CodeProposal', () => {
  it('shows the diff and applies/dismisses via the buttons', () => {
    const onApply = vi.fn();
    const onDismiss = vi.fn();
    render(
      <CodeProposal
        path="/a.ts"
        original="const a = 1;"
        suggested="const a = 2;"
        onApply={onApply}
        onDismiss={onDismiss}
      />,
    );

    const diff = screen.getByLabelText('diff');
    expect(diff).toHaveAttribute('data-original', 'const a = 1;');
    expect(diff).toHaveAttribute('data-modified', 'const a = 2;');

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
