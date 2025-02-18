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
  let capturedResponse: Record<string, any> | undefined;
  const originalJson = res.json;
  res.json = function(body: any) {
    capturedResponse = body;
    return originalJson.apply(res, [body]);
  };

  // Log response on finish
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const memoryUsage = process.memoryUsage();
      const logData = {
        method: req.method,
        path,
        status: res.statusCode,
        duration: `${duration}ms`,
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB'
        },
        response: capturedResponse
      };

      logger.info('[API] Request completed', logData);
    }
  });

  next();
};

app.use(requestLogger);

const findAvailablePort = async (basePort: number): Promise<number> => {
  try {
    portfinder.basePort = basePort;
    const port = await portfinder.getPortPromise();
    logger.info(`Found available port: ${port}`);
    return port;
  } catch (error) {
    logger.error('Error finding available port:', error);
    throw error;
  }
};

const startServer = async () => {
  try {
    // Initialize auth before routes
    await setupAuth(app);

    // Register API routes first
    const httpServer = registerRoutes(app);

    // Configure port with proper retries and logging 
    const preferredPort = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    let port = await findAvailablePort(preferredPort);

    // Add health check endpoint before starting server
    app.get('/health', (_req, res) => {
      res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        port,
        timestamp: new Date().toISOString()
      });
    });

    logger.info('Attempting to start server on port:', port);
    httpServer.listen(port, "0.0.0.0", () => {
      logger.info(`Server is running on port ${port}`);
      logger.info(`Server URL: http://0.0.0.0:${port}`);
      logger.info('Environment:', process.env.NODE_ENV);
      logger.info('Server ready for connections');

      // Initialize Socket.IO after port binding is confirmed
      const io = new Server(httpServer, {
        cors: { origin: "*" },
        path: '/socket.io/'
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
    }).on('error', (err: Error) => {
      logger.error('Server listen error:', {
        error: err.message,
        port
      });
      process.exit(1);
    });

    // Setup Vite after server is started
    await setupVite(app, httpServer);

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