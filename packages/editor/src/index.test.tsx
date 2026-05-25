// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    language,
    onChange,
  }: {
    value?: string;
    language?: string;
    onChange?: (v: string | undefined) => void;
  }) => (
    <textarea
      aria-label="monaco"
      data-language={language}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
  DiffEditor: ({ original, modified }: { original?: string; modified?: string }) => (
    <div aria-label="diff" data-original={original} data-modified={modified} />
  ),
}));

import { CodeEditor, DiffViewer, languageForPath } from './index';

describe('languageForPath', () => {
  it('maps known extensions to Monaco language ids', () => {
    expect(languageForPath('src/a.ts')).toBe('typescript');
    expect(languageForPath('README.md')).toBe('markdown');
    expect(languageForPath('main.py')).toBe('python');
  });

  it('falls back to plaintext for unknown extensions', () => {
    expect(languageForPath('LICENSE')).toBe('plaintext');
  });
});

describe('CodeEditor', () => {
  it('forwards value and language and reports edits via onChange', () => {
    const onChange = vi.fn();
    render(<CodeEditor value="hi" language="typescript" onChange={onChange} />);

    const editor = screen.getByLabelText('monaco');
    expect(editor).toHaveValue('hi');
    expect(editor).toHaveAttribute('data-language', 'typescript');

    fireEvent.change(editor, { target: { value: 'bye' } });
    expect(onChange).toHaveBeenCalledWith('bye');
  });
});

describe('DiffViewer', () => {
  it('passes original and modified text to the diff editor', () => {
    render(<DiffViewer original="const a = 1;" modified="const a = 2;" language="typescript" />);
    const diff = screen.getByLabelText('diff');
    expect(diff).toHaveAttribute('data-original', 'const a = 1;');
    expect(diff).toHaveAttribute('data-modified', 'const a = 2;');
  });
});
