import { describe, it, expect } from 'vitest';
import {
  EDITION,
  IS_COMPETITION,
  CLAUDE_ENABLED,
  CYBERSEC_ENABLED,
  EDITION_LABEL,
} from './edition';

// Vitest sets __STRIX_EDITION__ = 'competition' (see vitest.config.ts) so the
// suite exercises the full feature set. This also documents the flag mapping:
// Competition unlocks Claude Code + Cybersec mode; M1 is FreeLLMAPI-only.
describe('edition flags', () => {
  it('resolves to the competition build under test', () => {
    expect(EDITION).toBe('competition');
    expect(IS_COMPETITION).toBe(true);
  });

  it('competition unlocks Claude Code and Cybersec mode', () => {
    expect(CLAUDE_ENABLED).toBe(true);
    expect(CYBERSEC_ENABLED).toBe(true);
    expect(EDITION_LABEL).toBe('M1 Competition');
  });
});
