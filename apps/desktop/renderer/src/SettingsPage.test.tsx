// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import { DEFAULT_SETTINGS } from './useSettings';

function setup(overrides = {}) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const onClose = vi.fn();
  render(
    <SettingsPage
      settings={DEFAULT_SETTINGS}
      onChange={onChange}
      onReset={onReset}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onChange, onReset, onClose };
}

describe('SettingsPage', () => {
  it('emits patches from controls', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('Color theme'), { target: { value: 'light' } });
    expect(onChange).toHaveBeenCalledWith({ theme: 'light' });

    fireEvent.change(screen.getByLabelText('Line numbers'), { target: { value: 'relative' } });
    expect(onChange).toHaveBeenCalledWith({ lineNumbers: 'relative' });
  });

  it('filters rows by the search query', () => {
    setup();
    expect(screen.getByLabelText('Tab size')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'minimap' } });
    expect(screen.queryByLabelText('Tab size')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Minimap')).toBeInTheDocument();
  });

  it('reset and close fire their handlers', () => {
    const { onReset, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
