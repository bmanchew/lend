import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import apiRouter from "./routes";
import { setupVite } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { setupAuth } from "./auth";
import { logger } from "./lib/logger";
import portfinder from 'portfinder';
import { createServer as createNetServer } from 'net';

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 1000, // Set very high for testing
  message: { error: "Too many requests from this IP, please try again later" }
});

const app = express();

// Essential middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(limiter);

// Request logging middleware
const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = Date.now().toString(36);
  const start = Date.now();

  // Clean headers for logging
  const safeHeaders = { ...req.headers };
  delete safeHeaders.authorization;
  delete safeHeaders.cookie;

  logger.info(`[API] ${req.method} ${req.path} started`, {
    requestId,
    query: req.query,
    body: req.body,
    headers: safeHeaders
  });

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`[API] ${req.method} ${req.path} completed in ${duration}ms`, {
      status: res.statusCode,
      requestId
    });
  });

  next();
};

app.use(requestLogger);

// Function to check if a port is available
const isPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = createNetServer()
      .once('error', () => {
        resolve(false);
      })
      .once('listening', () => {
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      })
      .listen(port, '0.0.0.0');
  });
};

// Function to wait for port to be available
const waitForPort = async (port: number, retries = 20, interval = 250): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    const available = await isPortAvailable(port);
    if (available) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Port ${port} is not available after ${retries} retries`);
};

const startServer = async () => {
  let httpServer: Server;
  
  // Graceful shutdown handler
  const shutdown = async () => {
    logger.info('Received shutdown signal');
    try {
      if (httpServer) {
        await new Promise((resolve) => httpServer.close(resolve));
        logger.info('HTTP server closed');
      }
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    // Initialize auth
    await setupAuth(app);

    // Create HTTP server
    const httpServer = createServer(app);

    // Mount API routes first (before Vite middleware)
    app.use('/api', apiRouter);

    // Then setup Vite
    await setupVite(app, httpServer);

    // Error handling middleware
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      logger.error('Error:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
      });
    });

    // Find available port
    const port = await portfinder.getPortPromise({ 
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000 
    });

    // Wait for port to be available before starting
    await waitForPort(port);

    // Start server
    const server = httpServer.listen(port, "0.0.0.0", () => {
      logger.info(`Server is running on port ${port}`);
      logger.info(`Server URL: http://0.0.0.0:${port}`);
    });

    // Initialize Socket.IO
    const io = new Server(server, {
      cors: { origin: "*" },
      path: '/socket.io/',
      transports: ['websocket', 'polling']
    });

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

    logger.info('Server initialization complete');

  } catch (error: any) {
    logger.error('Failed to start server:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

startServer().catch((error) => {
  logger.error('Critical server error:', error);
  process.exit(1);
});