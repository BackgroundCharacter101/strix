// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Monaco can't render in jsdom; stub the editor with a labelled textarea so the
// viewer's load/dirty/save logic is exercised against a controllable element.
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
import { makeStrixApi } from '../test-utils';

const read = vi.fn<[string], Promise<string>>();
const write = vi.fn<[string, string], Promise<void>>();

beforeEach(() => {
  read.mockReset();
  write.mockReset();
  window.strix = makeStrixApi({ fs: { read, write } });
});

describe('FileViewer', () => {
  it('shows a placeholder when no file is selected', () => {
    render(<FileViewer path={null} />);
    expect(screen.getByText('No file selected')).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it('reads and displays the file contents in an editable field', async () => {
    read.mockResolvedValue('const x = 1;');
    render(<FileViewer path="/ws/a.ts" />);
    expect(await screen.findByDisplayValue('const x = 1;')).toHaveAttribute(
      'aria-label',
      'File contents',
    );
    expect(read).toHaveBeenCalledWith('/ws/a.ts');
  });

  it('surfaces a read error', async () => {
    read.mockRejectedValue(new Error('ENOENT'));
    render(<FileViewer path="/ws/missing.ts" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('ENOENT');
  });

  it('marks the buffer dirty on edit and writes it on save', async () => {
    read.mockResolvedValue('old');
    write.mockResolvedValue();
    render(<FileViewer path="/ws/a.ts" />);

    const textarea = await screen.findByDisplayValue('old');
    const saveButton = screen.getByRole('button', { name: 'Save' });

    // Clean buffer: save disabled, no dirty marker.
    expect(saveButton).toBeDisabled();
    expect(screen.queryByLabelText('unsaved changes')).not.toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'new content' } });
    expect(screen.getByLabelText('unsaved changes')).toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);
    await waitFor(() => expect(write).toHaveBeenCalledWith('/ws/a.ts', 'new content'));

    // After a successful save the buffer is clean again.
    await waitFor(() =>
      expect(screen.queryByLabelText('unsaved changes')).not.toBeInTheDocument(),
    );
  });
});
