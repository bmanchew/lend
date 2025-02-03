import { ViteDevServer, createServer } from 'vite';
import express from 'express';
import { Server } from 'http';

export async function setupVite(app: express.Application, httpServer: Server) {
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: {
        server: httpServer,
        port: process.env.VITE_PORT || 3000,
        protocol: 'ws',
        host: '0.0.0.0',
        timeout: 120000,
        overlay: true,
        path: '/__vite_hmr',
        clientPort: process.env.VITE_PORT || 3000
      },
      watch: {
        usePolling: false,
        ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**']
      },
    },
    optimizeDeps: {
      force: true,
      entries: ['./src/**/*.{ts,tsx}']
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