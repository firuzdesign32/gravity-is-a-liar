import { defineConfig } from 'vite';

// base './' makes the build work on GitHub Pages (sub-path), inside Tauri, and from any folder.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  server: { host: true },
});
