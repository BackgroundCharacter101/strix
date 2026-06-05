import { describe, it, expect } from 'vitest';
import { cleanCommitMessage, COMMIT_MESSAGE_INSTRUCTION } from './commitMessage';

describe('cleanCommitMessage', () => {
  it('passes a plain message through', () => {
    expect(cleanCommitMessage('feat: add widget')).toBe('feat: add widget');
  });

  it('strips code fences', () => {
    expect(cleanCommitMessage('```\nfix: bug\n```')).toBe('fix: bug');
    expect(cleanCommitMessage('```text\nfix: bug\n```')).toBe('fix: bug');
  });

  it('strips wrapping quotes and backticks', () => {
    expect(cleanCommitMessage('"feat: x"')).toBe('feat: x');
    expect(cleanCommitMessage('`chore: y`')).toBe('chore: y');
  });

  it('strips a leading "Commit message:" label', () => {
    expect(cleanCommitMessage('Commit message: docs: update readme')).toBe(
      'docs: update readme',
    );
  });

  it('preserves a multi-line body', () => {
    const msg = 'feat: add thing\n\nLonger explanation here.';
    expect(cleanCommitMessage(msg)).toBe(msg);
  });

  it('exposes an instruction string', () => {
    expect(COMMIT_MESSAGE_INSTRUCTION).toMatch(/commit message/i);
  });
});
