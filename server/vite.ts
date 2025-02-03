import { ViteDevServer, createServer } from 'vite';
import express from 'express';
import { Server } from 'http';

export async function setupVite(app: express.Application, httpServer: Server) {
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: {
        server: httpServer,
        port: 3000,
        protocol: 'ws',
        host: '0.0.0.0',
        clientPort: 3000,
        timeout: 60000,
        overlay: {
          errors: true,
          warnings: false
        },
        path: '/__vite_hmr',
        reconnect: true
      },
      watch: {
        usePolling: true,
        interval: 500,
        followSymlinks: false,
        ignored: ['**/node_modules/**', '**/dist/**']
      },
    },
    optimizeDeps: {
      force: true
    },
    appType: 'spa',
    clearScreen: false
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