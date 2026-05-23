import { describe, it, expect } from 'vitest';
import { initializeLsp } from './index';

describe('@tabea/lsp', () => {
  it('returns initialization status text', () => {
    expect(initializeLsp()).toContain('initialized');
  });
});
