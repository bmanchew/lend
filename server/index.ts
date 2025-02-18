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
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 2000, // Higher limit
  message: { error: "Too many requests, please try again in 15 minutes" }
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

    // Find available port starting from 3001
    const port = await portfinder.getPortPromise({ 
      port: 3001,
      stopPort: 3999
    });

    // Handle cleanup on termination signals
    const cleanup = () => {
      logger.info('Received termination signal');
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

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