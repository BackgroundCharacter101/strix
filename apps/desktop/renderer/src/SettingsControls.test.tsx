// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toggle, SettingRow } from './SettingsControls';

describe('Toggle', () => {
  it('is a switch carrying its label as the accessible name', () => {
    render(<Toggle checked={false} onChange={vi.fn()} label="Reduce motion" />);
    const sw = screen.getByRole('switch', { name: 'Reduce motion' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('reports the new value on click', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Reduce motion" />);
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles off again when already on', () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} label="Liquid Glass" />);
    expect(screen.getByRole('switch', { name: 'Liquid Glass' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('switch', { name: 'Liquid Glass' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does not fire while disabled', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Reduce motion" disabled />);
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is not a native checkbox', () => {
    // The old panel used raw <input type="checkbox">, which renders as a blue
    // Windows control inside a near-black amber IDE.
    const { container } = render(<Toggle checked onChange={vi.fn()} label="X" />);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });
});

describe('SettingRow', () => {
  it('shows the label and description beside its control', () => {
    render(
      <SettingRow label="Color theme" description="Overall UI theme.">
        <button type="button">control</button>
      </SettingRow>,
    );
    expect(screen.getByText('Color theme')).toBeInTheDocument();
    expect(screen.getByText('Overall UI theme.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'control' })).toBeInTheDocument();
  });
});
