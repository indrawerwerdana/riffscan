import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work on any GitHub Pages repo path.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
