// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentModeControl } from './AgentModeControl';

describe('AgentModeControl', () => {
  it('renders all three modes as one radiogroup', () => {
    render(<AgentModeControl mode="manual" onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Agent mode' })).toBeInTheDocument();
    for (const name of ['Manual', 'Accept edits', 'Plan']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
  });

  it('marks exactly one mode active', () => {
    render(<AgentModeControl mode="plan" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Plan' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Manual' })).toHaveAttribute('aria-checked', 'false');
  });

  it('reports the picked mode on click', () => {
    const onChange = vi.fn();
    render(<AgentModeControl mode="manual" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Accept edits' }));
    expect(onChange).toHaveBeenCalledWith('accept');
  });

  it('moves to the next mode with ArrowRight and wraps with ArrowLeft', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AgentModeControl mode="manual" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Manual' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('accept');

    onChange.mockClear();
    rerender(<AgentModeControl mode="manual" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Manual' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('plan');
  });

  it('keeps only the active mode in the tab order', () => {
    render(<AgentModeControl mode="accept" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Accept edits' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Manual' })).toHaveAttribute('tabindex', '-1');
  });
});
