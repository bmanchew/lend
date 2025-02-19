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
    headers: safeHeaders,
    timestamp: new Date().toISOString()
  });

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`[API] ${req.method} ${req.path} completed in ${duration}ms`, {
      status: res.statusCode,
      requestId,
      timestamp: new Date().toISOString()
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
      logger.info(`Port ${port} is available`);
      return;
    }
    logger.info(`Waiting for port ${port} (attempt ${i + 1}/${retries})`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Port ${port} is not available after ${retries} retries`);
};

const startServer = async () => {
  try {
    // Create HTTP server
    const httpServer = createServer(app);

    // Setup auth first (this adds the session middleware)
    await setupAuth(app);

    // Mount API routes after auth setup
    app.use(apiRouter);

    // Setup Vite last
    await setupVite(app, httpServer);

    // Error handling middleware
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      logger.error('Error:', {
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
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
    httpServer.listen(port, "0.0.0.0", () => {
      logger.info(`Server started successfully`, {
        url: `http://0.0.0.0:${port}`,
        timestamp: new Date().toISOString()
      });

      // Make port available to other processes
      process.env.PORT = port.toString();
    });

    // Initialize Socket.IO
    const io = new Server(httpServer, {
      cors: { origin: "*" },
      path: '/socket.io/',
      transports: ['websocket', 'polling']
    });

    (global as any).io = io;

    io.on('connection', (socket) => {
      logger.info('Client connected:', {
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });

      socket.on('join_merchant_room', (merchantId: number) => {
        socket.join(`merchant_${merchantId}`);
        logger.info('Socket joined merchant room:', {
          socketId: socket.id,
          merchantId,
          timestamp: new Date().toISOString()
        });
      });

      socket.on('disconnect', () => {
        logger.info('Client disconnected:', {
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });
      });
    });

  } catch (error: any) {
    logger.error('Failed to start server:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', {
    reason,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

startServer().catch((error) => {
  logger.error('Critical server error:', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});