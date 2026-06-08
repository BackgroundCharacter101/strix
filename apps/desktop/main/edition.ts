// Main-process copy of the build-time edition flag (the renderer has its own in
// src/edition.ts — they can't share a module across the main/renderer tsconfig
// boundary). Baked in by esbuild via a `__STRIX_EDITION__` define. See the
// renderer module for the full rationale.
declare const __STRIX_EDITION__: string;

export type Edition = 'm1' | 'competition';

const raw: string = typeof __STRIX_EDITION__ === 'undefined' ? 'm1' : __STRIX_EDITION__;

export const EDITION: Edition = raw === 'competition' ? 'competition' : 'm1';

export const IS_COMPETITION = EDITION === 'competition';

/** Claude Code hand-off (the "Start Claude Code" menu item lives in main). */
export const CLAUDE_ENABLED = IS_COMPETITION;
