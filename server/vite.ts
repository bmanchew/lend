
import { ViteDevServer, createServer } from 'vite';
import express from 'express';
import { Server } from 'http';

export async function setupVite(app: express.Application, httpServer: Server) {
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: false, // Disable HMR completely to prevent WebSocket connection attempts
      watch: {
        usePolling: true, // Use polling instead of WebSocket
        interval: 1000,
          errors: true,
          warnings: true
        },
        clientPort: process.env.VITE_PORT || 3000
      },
      watch: {
        usePolling: false,
        ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/coverage/**']
      }
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@tanstack/react-query'
      ],
      exclude: ['vitest']
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          main: './client/src/main.tsx'
        }
      }
    },
    appType: 'spa',
    clearScreen: false,
    logLevel: 'info'
  });

  app.use(vite.middlewares);
  return vite;
}

export function serveStatic(app: express.Application) {
  app.use(express.static('dist'));
}

export function log(message: string) {
  console.log(`[vite] ${message}`);
}
