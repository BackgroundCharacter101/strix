import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests exercise the full feature set (Claude Code + Cybersec mode), so the
  // edition flag resolves to the private "competition" build under Vitest.
  define: {
    __STRIX_EDITION__: JSON.stringify('competition'),
  },
  test: {
    include: [
      'apps/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'packages/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'scripts/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'
    ],
    environment: 'node',
    globals: true,
    passWithNoTests: true
  }
});
