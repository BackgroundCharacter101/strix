// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Monaco does not run under jsdom; stand in with a plain textarea that reports
// its value the same way, so this test covers OUR parse/validate/apply logic.
vi.mock('@strix/editor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="settings json" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
  languageForPath: () => 'json',
}));

import { SettingsJson } from './SettingsJson';
import { DEFAULT_SETTINGS } from './useSettings';

const editor = () => screen.getByLabelText('settings json');

describe('SettingsJson', () => {
  it('renders the current settings as JSON', () => {
    render(<SettingsJson settings={DEFAULT_SETTINGS} onApply={vi.fn()} />);
    expect((editor() as HTMLTextAreaElement).value).toContain('"fontSize"');
  });

  it('applies a valid edit', () => {
    const onApply = vi.fn();
    render(<SettingsJson settings={DEFAULT_SETTINGS} onApply={onApply} />);
    fireEvent.change(editor(), {
      target: { value: JSON.stringify({ ...DEFAULT_SETTINGS, fontSize: 18 }, null, 2) },
    });
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 18 }));
  });

  it('shows an error and applies nothing when the JSON is invalid', () => {
    const onApply = vi.fn();
    render(<SettingsJson settings={DEFAULT_SETTINGS} onApply={onApply} />);
    fireEvent.change(editor(), { target: { value: '{ "fontSize": ' } });
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('clears the error once the JSON parses again', () => {
    render(<SettingsJson settings={DEFAULT_SETTINGS} onApply={vi.fn()} />);
    fireEvent.change(editor(), { target: { value: '{ oops' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(editor(), { target: { value: '{}' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses a JSON top level that is not an object', () => {
    const onApply = vi.fn();
    render(<SettingsJson settings={DEFAULT_SETTINGS} onApply={onApply} />);
    fireEvent.change(editor(), { target: { value: '[1,2,3]' } });
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
