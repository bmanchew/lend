import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
    hmr: {
      protocol: 'ws',
      host: '0.0.0.0',
      port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
      clientPort: process.env.PORT ? parseInt(process.env.PORT) : 3001,
      timeout: 5000,
      overlay: true
    },
    proxy: {
      '/api': {
        target: 'http://0.0.0.0:3000',
        changeOrigin: true,
        secure: false
      },
      '/socket.io': {
        target: 'http://0.0.0.0:3000',
        ws: true,
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});