import { describe, it, expect } from 'vitest';
import { TerminalPanel } from './index';

describe('@tabea/terminal', () => {
  it('returns a terminal placeholder React element', () => {
    const element = TerminalPanel();
    expect(element).toBeDefined();
  });
});
