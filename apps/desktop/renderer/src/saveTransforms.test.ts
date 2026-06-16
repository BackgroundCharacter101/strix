import { describe, it, expect } from 'vitest';
import { applySaveTransforms } from './saveTransforms';

describe('applySaveTransforms', () => {
  it('does nothing when no options are set', () => {
    expect(applySaveTransforms('a  \nb\t', {})).toBe('a  \nb\t');
  });

  it('trims trailing whitespace, preserving CR', () => {
    expect(applySaveTransforms('a  \nb\t\nc', { trimTrailingWhitespace: true })).toBe('a\nb\nc');
    expect(applySaveTransforms('a  \r\nb', { trimTrailingWhitespace: true })).toBe('a\r\nb');
  });

  it('inserts a final newline only when missing + non-empty', () => {
    expect(applySaveTransforms('a', { insertFinalNewline: true })).toBe('a\n');
    expect(applySaveTransforms('a\n', { insertFinalNewline: true })).toBe('a\n');
    expect(applySaveTransforms('', { insertFinalNewline: true })).toBe('');
  });

  it('normalizes EOL', () => {
    expect(applySaveTransforms('a\nb', { eol: 'crlf' })).toBe('a\r\nb');
    expect(applySaveTransforms('a\r\nb', { eol: 'lf' })).toBe('a\nb');
  });

  it('applies all in order (trim → final newline → crlf)', () => {
    expect(
      applySaveTransforms('a  \nb', { trimTrailingWhitespace: true, insertFinalNewline: true, eol: 'crlf' }),
    ).toBe('a\r\nb\r\n');
  });
});
