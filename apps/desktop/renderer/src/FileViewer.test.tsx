// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Monaco can't render in jsdom; stub the editor with a labelled textarea.
vi.mock('@strix/editor', () => ({
  languageForPath: () => 'plaintext',
  CodeEditor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea
      aria-label="File contents"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

import { FileViewer } from './FileViewer';
import type { FileBuffer } from './useFileBuffer';

function makeBuffer(overrides: Partial<FileBuffer> = {}): FileBuffer {
  return {
    draft: '',
    setDraft: vi.fn(),
    loading: false,
    error: null,
    dirty: false,
    saving: false,
    saveError: null,
    save: vi.fn(),
    ...overrides,
  };
}

describe('FileViewer', () => {
  it('shows a welcome placeholder when no file is selected', () => {
    render(<FileViewer path={null} buffer={makeBuffer()} />);
    expect(screen.getByText('AI-native code editor')).toBeInTheDocument();
  });

  it('shows the loading and error states', () => {
    const { rerender } = render(<FileViewer path="/a.ts" buffer={makeBuffer({ loading: true })} />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<FileViewer path="/a.ts" buffer={makeBuffer({ error: 'ENOENT' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ENOENT');
  });

  it('renders the draft and reports edits via the buffer', () => {
    const setDraft = vi.fn();
    render(<FileViewer path="/a.ts" buffer={makeBuffer({ draft: 'hi', setDraft })} />);

    const editor = screen.getByLabelText('File contents');
    expect(editor).toHaveValue('hi');
    fireEvent.change(editor, { target: { value: 'bye' } });
    expect(setDraft).toHaveBeenCalledWith('bye');
  });

  it('disables Save when clean and invokes save when dirty', () => {
    const save = vi.fn();
    const { rerender } = render(
      <FileViewer path="/a.ts" buffer={makeBuffer({ dirty: false, save })} />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByLabelText('unsaved changes')).not.toBeInTheDocument();

    rerender(<FileViewer path="/a.ts" buffer={makeBuffer({ dirty: true, save })} />);
    expect(screen.getByLabelText('unsaved changes')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(save).toHaveBeenCalled();
  });
});
