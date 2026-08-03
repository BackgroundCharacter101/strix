// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
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

  it('moves DOM focus to the newly selected button on arrow-key navigation', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AgentModeControl mode="manual" onChange={onChange} />);
    const manualBtn = screen.getByRole('radio', { name: 'Manual' });
    manualBtn.focus();
    expect(document.activeElement).toBe(manualBtn);

    fireEvent.keyDown(manualBtn, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('accept');

    // Simulate the parent updating `mode` in response to onChange, as a
    // controlled component would.
    rerender(<AgentModeControl mode="accept" onChange={onChange} />);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Accept edits' }));
  });

  it('does not steal focus when mode changes without prior keyboard focus in the group', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AgentModeControl mode="manual" onChange={onChange} />);

    const outsideInput = document.createElement('input');
    document.body.appendChild(outsideInput);
    outsideInput.focus();
    expect(document.activeElement).toBe(outsideInput);

    rerender(<AgentModeControl mode="accept" onChange={onChange} />);
    expect(document.activeElement).toBe(outsideInput);

    document.body.removeChild(outsideInput);
  });
});

describe('selection thumb', () => {
  // The labels are different lengths, so the segments are NOT equal thirds.
  // The thumb must be sized/positioned from the ACTIVE button, not from a
  // hardcoded 1/3 — that version lined up on Manual and drifted off the others.
  const thumbOf = (c: HTMLElement) => c.querySelector('.ai-segmented-thumb') as HTMLElement;

  it('sizes and positions itself from the measured active segment', () => {
    const { container, rerender } = render(<AgentModeControl mode="manual" onChange={vi.fn()} />);
    const thumb = thumbOf(container);
    // jsdom reports 0 for layout, so assert the mechanism: inline width/transform
    // driven by measurement, never a CSS-only 1/3 assumption.
    expect(thumb.style.width).toMatch(/px$/);
    expect(thumb.style.transform).toMatch(/^translateX\(-?\d+px\)$/);

    rerender(<AgentModeControl mode="plan" onChange={vi.fn()} />);
    expect(thumbOf(container).style.transform).toMatch(/^translateX\(-?\d+px\)$/);
  });

  it('does not hardcode a one-third width in the stylesheet', () => {
    const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
    const rule = css.slice(css.indexOf('.ai-segmented-thumb'), css.indexOf('.ai-segmented-thumb') + 400);
    expect(rule).not.toMatch(/\/\s*3\s*\)/);
  });
});

describe('accept-edits ambient signal', () => {
  it('is styled so the composer shows when the AI may write files', () => {
    const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
    expect(css).toMatch(/\.ai-composer\.is-accept-mode\s*\{/);
  });
});
