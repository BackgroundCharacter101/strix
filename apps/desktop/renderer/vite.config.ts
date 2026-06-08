import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM-correct dirname: apps/desktop is "type": "module", so __dirname is
// unavailable here and Vite would mis-resolve `root` / the index.html entry.
const dirname = path.dirname(fileURLToPath(import.meta.url));

// Product edition baked in at build time (STRIX_EDITION=competition → the
// private build with Claude Code + Cybersec mode; anything else → the free M1).
const edition = process.env.STRIX_EDITION === 'competition' ? 'competition' : 'm1';

export default defineConfig({
  plugins: [react()],
  define: {
    __STRIX_EDITION__: JSON.stringify(edition),
  },
  // Relative asset paths so the built index.html works when loaded via file://
  // in the Electron production window.
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
    },
  },
  server: {
    port: 3000,
  },
});
