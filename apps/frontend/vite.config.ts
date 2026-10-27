import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/tasks': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/sessions': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/preview': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
});
