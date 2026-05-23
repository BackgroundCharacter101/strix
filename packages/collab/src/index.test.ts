import { describe, it, expect } from 'vitest';
import { initializeCollab } from './index';

describe('@tabea/collab', () => {
  it('returns collaboration initialization text', () => {
    expect(initializeCollab()).toContain('initialized');
  });
});
