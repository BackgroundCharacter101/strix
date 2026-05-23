import { describe, it, expect } from 'vitest';
import { uiReady } from './index';

describe('@tabea/ui', () => {
  it('returns UI readiness text', () => {
    expect(uiReady()).toContain('ready');
  });
});
