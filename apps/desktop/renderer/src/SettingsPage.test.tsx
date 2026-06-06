// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import { DEFAULT_SETTINGS } from './useSettings';
import { makeStrixApi } from '../test-utils';

beforeEach(() => {
  window.strix = makeStrixApi();
});

function setup(overrides = {}) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(
    <SettingsPage
      settings={DEFAULT_SETTINGS}
      onChange={onChange}
      onReset={onReset}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onChange, onReset, onClose, onSave };
}

describe('SettingsPage', () => {
  it('emits patches from controls', () => {
    const { onChange } = setup();
    // Appearance is the default section.
    fireEvent.change(screen.getByLabelText('Color theme'), { target: { value: 'light' } });
    expect(onChange).toHaveBeenCalledWith({ theme: 'light' });

    // Switch to the Editor section to reach its controls.
    fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    fireEvent.change(screen.getByLabelText('Line numbers'), { target: { value: 'relative' } });
    expect(onChange).toHaveBeenCalledWith({ lineNumbers: 'relative' });
  });

  it('filters rows by the search query', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    expect(screen.getByLabelText('Tab size')).toBeInTheDocument();
    // Searching reveals all sections, then filters rows by the query.
    fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'minimap' } });
    expect(screen.queryByLabelText('Tab size')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Minimap')).toBeInTheDocument();
  });

  it('adds a FreeLLMAPI provider key from the AI section', async () => {
    const addKey = vi.fn(async () => ({ ok: true }));
    window.strix = makeStrixApi({ ai: { addKey } });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add key' }));
    await waitFor(() =>
      expect(addKey).toHaveBeenCalledWith('groq', 'sk-test-123', undefined),
    );
  });

  it('Save fires its handler', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalled();
  });

  it('reset and close fire their handlers', () => {
    const { onReset, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onClose).toHaveBeenCalled();
  });
});
