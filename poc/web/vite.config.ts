import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [react()],
  server: { fs: { allow: ['..'] }, port: 5173 },
  build: { outDir: '../out/web', emptyOutDir: true },
});
