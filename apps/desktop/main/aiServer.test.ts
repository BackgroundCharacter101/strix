import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { aiServerPaths } from './aiServer';

describe('aiServerPaths', () => {
  it('resolves the vendored FreeLLMAPI server from the built main dir', () => {
    const mainDir = path.resolve('/repo', 'apps', 'desktop', 'dist', 'main');
    const { dir, entry } = aiServerPaths(mainDir);

    expect(dir).toBe(path.resolve('/repo', 'freellmapi'));
    expect(entry).toBe(path.resolve('/repo', 'freellmapi', 'server', 'dist', 'index.js'));
  });
});
