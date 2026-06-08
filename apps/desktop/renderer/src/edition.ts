// Build-time product edition — baked into the bundle by Vite (renderer),
// esbuild (main) and Vitest via a `__STRIX_EDITION__` define. Two editions ship
// from the SAME codebase:
//
//   • 'm1'          — the free public release: FreeLLMAPI only. No Claude Code
//                     hand-off, no Cybersec mode.
//   • 'competition' — "M1 Competition", the private build: everything in M1
//                     PLUS the Claude Code integration and Cybersec mode.
//
// The two are identical apart from those two features. Because the flag is a
// compile-time constant, the public M1 build contains no code path that can turn
// the private features on — they're tree-shaken out, not merely hidden.
declare const __STRIX_EDITION__: string;

export type Edition = 'm1' | 'competition';

// `typeof` never throws on an undeclared global, so if the define is ever
// missing we fall back to the SAFE (free) edition rather than leaking the
// private features into a public build.
const raw: string = typeof __STRIX_EDITION__ === 'undefined' ? 'm1' : __STRIX_EDITION__;

export const EDITION: Edition = raw === 'competition' ? 'competition' : 'm1';

export const IS_COMPETITION = EDITION === 'competition';

/** Claude Code hand-off: "Ask Claude Code", the terminal launcher + menu item. */
export const CLAUDE_ENABLED = IS_COMPETITION;

/** Cybersec mode: the workbench toggle, green editor theme, security AI persona. */
export const CYBERSEC_ENABLED = IS_COMPETITION;

/** Human-readable edition name (About dialog / window title). */
export const EDITION_LABEL = IS_COMPETITION ? 'M1 Competition' : 'M1';
