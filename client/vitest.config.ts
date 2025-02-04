import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false, // Disable CSS modules handling in tests
    root: '.',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
  },
});