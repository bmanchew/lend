import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import apiRouter from "./routes";
import { setupVite, serveStatic } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { setupAuth } from "./auth";
import { logger } from "./lib/logger";
import portfinder from 'portfinder';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Essential middleware
const app = express();
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://shifi.replit.app' : '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize authentication first
await setupAuth(app);

// Mount API routes under /api prefix BEFORE Vite setup
app.use("/api", apiRouter);

// Add health check route
app.get('/', (_req, res) => {
  res.sendStatus(200);
});

interface SocketError extends Error {
  data?: any;
}

const startServer = async () => {
  try {
    // Create HTTP server
    const httpServer = createServer(app);

    // Configure port finder
    portfinder.basePort = 5000;
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : await portfinder.getPortPromise();
    const host = '0.0.0.0';

    // Set default timeout
    httpServer.timeout = 120000; // 2 minutes
    httpServer.keepAliveTimeout = 65000; // slightly higher than 60 seconds

    // Start HTTP server first and wait for it to be ready
    await new Promise<void>((resolve, reject) => {
      try {
        httpServer.listen(port, host, () => {
          logger.info(`Server listening on port ${port}`, {
            port,
            env: process.env.NODE_ENV,
            timestamp: new Date().toISOString()
          });
          process.env.PORT = port.toString();
          resolve();
        });

        httpServer.on('error', (err) => {
          logger.error('Server startup error:', {
            error: err.message,
            stack: err.stack,
            timestamp: new Date().toISOString()
          });
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });

    // Setup static file serving based on environment
    if (process.env.NODE_ENV === 'production') {
      // Get current file's directory path using ES modules
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      // In production, serve from dist/public
      const staticPath = path.resolve(__dirname, '..', 'dist', 'public');
      logger.info(`Serving static files from: ${staticPath}`, {
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      });

      // Serve static files
      app.use(express.static(staticPath));

      // Serve index.html for client-side routing
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
          res.sendFile(path.join(staticPath, 'index.html'));
        }
      });
    } else {
      // In development, use Vite middleware
      await setupVite(app, httpServer);
    }

    // Socket.IO setup with proper error handling
    const io = new Server(httpServer, {
      cors: { origin: "*" },
      path: '/socket.io/'
    });

    (global as any).io = io;

    io.on('connection', (socket) => {
      const socketContext = {
        socketId: socket.id,
        transport: socket.conn.transport.name,
        remoteAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      };

      logger.info("Socket connected:", socketContext);

      socket.on('join_merchant_room', (merchantId: number) => {
        const roomName = `merchant_${merchantId}`;
        socket.join(roomName);
        logger.info("Joined merchant room:", { merchantId, roomName, socketId: socket.id });
      });

      socket.on('error', (error: SocketError) => {
        logger.error("Socket error:", { 
          error: error.message,
          data: error.data,
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });
      });

      socket.on('disconnect', (reason) => {
        logger.info("Socket disconnected:", { 
          reason, 
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });
      });
    });

    // Signal that the server is ready for connections
    logger.info("Server is ready for connections", {
      port,
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error("Failed to start server:", {
      message: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString()
    });

    process.exit(1);
  }
};

// Handle startup errors
startServer().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error("Critical server error:", {
    message: errorMessage,
    stack: errorStack,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error("Uncaught exception:", {
    message: error.message,
    stack: error.stack,
    name: error.name,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error("Unhandled rejection:", {
    message: error.message,
    stack: error.stack,
    name: error.name,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info("Graceful shutdown initiated", {
    timestamp: new Date().toISOString()
  });
  process.exit(0);
});