import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Workspace packages (@quidsin/*) are npm-workspace symlinks. Without
    // this, Vite resolves them to their real path under packages/*,
    // treats the already-built dist/*.js as project *source* rather than
    // a dependency, and tries to run it through the TS-aware transform
    // pipeline — which then fails doing tsconfig lookup/`include`
    // resolution for files that live under dist/, not src/.
    preserveSymlinks: true,
  },
});
