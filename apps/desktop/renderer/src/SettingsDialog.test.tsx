// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsDialog } from './SettingsDialog';
import { DEFAULT_SETTINGS } from './useSettings';

describe('SettingsDialog', () => {
  it('emits patches when controls change', () => {
    const onChange = vi.fn();
    render(<SettingsDialog settings={DEFAULT_SETTINGS} onChange={onChange} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Color theme'), { target: { value: 'light' } });
    expect(onChange).toHaveBeenCalledWith({ theme: 'light' });

    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '16' } });
    expect(onChange).toHaveBeenCalledWith({ fontSize: 16 });

    fireEvent.click(screen.getByLabelText('Word wrap'));
    expect(onChange).toHaveBeenCalledWith({ wordWrap: true });
  });

  it('closes via Done', () => {
    const onClose = vi.fn();
    render(<SettingsDialog settings={DEFAULT_SETTINGS} onChange={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});
