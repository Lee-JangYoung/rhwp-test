import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  root: new URL('.', import.meta.url).pathname,
  plugins: [react()],
  server: { fs: { allow: ['..'] }, port: 5173 },
  build: { assetsInlineLimit: 20_000, outDir: '../out/web', emptyOutDir: true },
});
