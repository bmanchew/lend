
import { ViteDevServer, createServer } from 'vite';
import express from 'express';
import { Server } from 'http';

export async function setupVite(app: express.Application, httpServer: Server) {
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: {
        port: 443,
        protocol: 'wss',
        clientPort: 443,
        host: '0.0.0.0'
      },
      https: true,
      host: '0.0.0.0',
      port: process.env.PORT || 3000,
      watch: {
        usePolling: true,
        interval: 1000,
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
