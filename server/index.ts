import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { setupAuth } from "./auth";
import { logger } from "./lib/logger";
import { LedgerManager } from "./services/ledger-manager";
import portfinder from 'portfinder';

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = Date.now().toString(36);
  const start = Date.now();
  const path = req.path;

  // Clean headers for logging
  const safeHeaders = { ...req.headers };
  delete safeHeaders.authorization;
  delete safeHeaders.cookie;

  logger.info(`[API] ${req.method} ${path} started`, {
    requestId,
    query: req.query,
    body: req.body,
    headers: safeHeaders
  });

  // Capture response
  const originalJson = res.json;
  res.json = function(body: any) {
    logger.info(`[API] Response for ${path}:`, { body, status: res.statusCode });
    return originalJson.call(this, body);
  };

  // Log response timing
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`[API] ${req.method} ${path} completed in ${duration}ms`);
  });

  next();
};

app.use(requestLogger);

// Health check endpoint with readiness probe
app.get('/health', (_req, res) => {
  const serverState = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    ready: global.io !== undefined, // Check if Socket.IO is initialized
    env: process.env.NODE_ENV
  };
  res.json(serverState);
});

// Wait for server readiness
const waitForServerReady = (server: any, port: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 30000); // 30 seconds timeout

    server.once('listening', () => {
      clearTimeout(timeout);
      resolve();
    });

    server.once('error', (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
};

const startServer = async () => {
  try {
    // Initialize auth
    await setupAuth(app);

    // Register routes and get HTTP server
    const httpServer = registerRoutes(app);

    // Find available port
    const preferredPort = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    const port = await portfinder.getPortPromise({ port: preferredPort });

    // Start server with proper error handling
    const server = httpServer.listen(port, "0.0.0.0");

    // Wait for server to be ready
    await waitForServerReady(server, port);

    logger.info(`Server is running on port ${port}`);
    logger.info(`Server URL: http://0.0.0.0:${port}`);
    logger.info('Environment:', process.env.NODE_ENV);
    logger.info('Server ready for connections');

    // Initialize Socket.IO
    const io = new Server(httpServer, {
      cors: { origin: "*" },
      path: '/socket.io/',
      transports: ['websocket', 'polling']
    });

    // Make io globally available
    (global as any).io = io;

    io.on('connection', (socket) => {
      logger.info('Client connected:', socket.id);

      socket.on('join_merchant_room', (merchantId: number) => {
        socket.join(`merchant_${merchantId}`);
        logger.info(`Socket ${socket.id} joined merchant room ${merchantId}`);
      });

      socket.on('disconnect', () => {
        logger.info('Client disconnected:', socket.id);
      });
    });

    // Setup Vite after server is ready
    await setupVite(app, httpServer);

    // Final readiness check
    const isReady = await new Promise((resolve) => {
      const checkReady = () => {
        if (global.io) {
          resolve(true);
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });

    if (!isReady) {
      throw new Error('Server failed to initialize completely');
    }

    logger.info('Server initialization complete');

  } catch (error: any) {
    logger.error('Failed to start server:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

// Start server with proper error handling
startServer().catch((error) => {
  logger.error('Critical server error:', error);
  process.exit(1);
});