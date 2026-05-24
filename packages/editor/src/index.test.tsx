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
}));

import { CodeEditor, languageForPath } from './index';

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
