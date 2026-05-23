import { describe, it, expect } from 'vitest';
import { EditorShell } from './index';

describe('@strix/editor', () => {
  it('returns a placeholder React element', () => {
    const element = EditorShell();
    expect(element).toBeDefined();
  });
});
