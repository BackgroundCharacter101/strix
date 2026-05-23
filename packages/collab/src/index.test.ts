import { describe, it, expect } from 'vitest';
import { initializeCollab } from './index';

describe('@strix/collab', () => {
  it('returns collaboration initialization text', () => {
    expect(initializeCollab()).toContain('initialized');
  });
});
