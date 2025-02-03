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
        overlay: true,
        timeout: 30000,
        path: '/hmr/',
      },
      watch: {
        usePolling: true,
        interval: 1000,
      },
    },
    appType: 'spa',
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