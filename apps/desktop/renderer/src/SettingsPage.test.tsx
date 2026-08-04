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
  const { container } = render(
    <SettingsPage
      settings={DEFAULT_SETTINGS}
      onChange={onChange}
      onReset={onReset}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onChange, onReset, onClose, container };
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

  it('adds a direct API-key model from the AI section', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    fireEvent.change(screen.getByLabelText('Model label'), { target: { value: 'GPT-4o mini' } });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://api.openai.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('Direct model API key'), {
      target: { value: 'sk-abc' },
    });
    fireEvent.change(screen.getByLabelText('Model id'), { target: { value: 'gpt-4o-mini' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        aiDirectModels: [
          expect.objectContaining({
            label: 'GPT-4o mini',
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'sk-abc',
            model: 'gpt-4o-mini',
          }),
        ],
      }),
    );
  });

  it('has no Save button, because settings persist as they change', () => {
    setup();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
  });

  it('reset (after confirming) and close fire their handlers', () => {
    const { onReset, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset everything' }));
    expect(onReset).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('applies a change immediately, without a Save step', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    expect(onChange).toHaveBeenCalled();
  });

  it('uses switches, not native checkboxes, for every boolean setting', () => {
    const { container } = setup();
    // Editor alone renders several boolean settings; the assertion stays loose
    // because the visible count depends on the active section.
    fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(5);
  });

  it('requires confirmation before resetting every setting', () => {
    const { onReset } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset everything' }));
    expect(onReset).toHaveBeenCalled();
  });

  it('lets you cancel out of the reset confirmation', () => {
    const { onReset } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Reset everything' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeInTheDocument();
  });
});
