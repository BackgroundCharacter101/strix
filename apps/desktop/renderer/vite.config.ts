import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM-correct dirname: apps/desktop is "type": "module", so __dirname is
// unavailable here and Vite would mis-resolve `root` / the index.html entry.
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
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
