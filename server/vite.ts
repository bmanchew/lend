import { ViteDevServer, createServer } from 'vite';
import express from 'express';
import { Server } from 'http';

export async function setupVite(app: express.Application, httpServer: Server) {
  const vite = await createServer({
    server: {
      middlewareMode: true,
      server: {
        port: parseInt(process.env.VITE_PORT || '3000'),
        host: '0.0.0.0'
      },
      hmr: {
        port: parseInt(process.env.VITE_PORT || '3000'),
        protocol: 'wss', // Changed to wss
        host: '0.0.0.0',
        timeout: 60000,
        overlay: {
          errors: true,
          warnings: false
        },
        clientPort: parseInt(process.env.VITE_PORT || '3001'),
        path: '/__hmr'
      },
      watch: {
        usePolling: false,
        ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/coverage/**', '**/attached_assets/**'],
        interval: 1000
      },
      port: parseInt(process.env.VITE_PORT || '3001'),
      host: '0.0.0.0'
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