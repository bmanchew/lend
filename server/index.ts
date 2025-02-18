import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { setupAuth } from "./auth";
import { logger } from "./lib/logger";
import { LedgerManager } from "./services/ledger-manager";

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

const startServer = async () => {
  try {
    // Initialize auth before routes
    await setupAuth(app);

    // Register API routes first
    const httpServer = registerRoutes(app);

    // Configure port with proper retries and logging 
    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    let retries = 5;

    // Initialize LedgerManager in background
    const ledgerConfig = {
      minBalance: 1000,
      maxBalance: 100000,
      sweepThreshold: 500,
      sweepSchedule: '0 */15 * * * *' // Every 15 minutes
    };

    const ledgerManager = LedgerManager.getInstance(ledgerConfig);
    ledgerManager.initializeSweeps().catch(error => {
      logger.error('Failed to initialize ledger sweeps:', error);
    });

    // Add health check endpoint before starting server
    app.get('/health', (_req, res) => {
      res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        port: PORT,
        timestamp: new Date().toISOString()
      });
    });

    const startListening = () => {
      return new Promise<void>((resolve, reject) => {
        const server = httpServer.listen(PORT, "0.0.0.0", () => {
          // Signal that the server is ready by writing to the console first
          console.log('Server listening on port', PORT);

          logger.info(`Server is running on port ${PORT}`);
          logger.info(`Server URL: http://0.0.0.0:${PORT}`);
          logger.info('Environment:', process.env.NODE_ENV);
          logger.info('Server ready for connections');

          // Initialize Socket.IO after port binding is confirmed
          const io = new Server(server, {
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

          resolve();
        })
        .on('error', (err: any) => {
          if (err.code === 'EADDRINUSE' && retries > 0) {
            retries--;
            logger.warn(`Port ${PORT} in use, retrying... (${retries} attempts left)`);
            setTimeout(() => {
              server.close();
              startListening().then(resolve).catch(reject);
            }, 1000);
          } else {
            logger.error('Server failed to start:', err);
            reject(err);
          }
        });
      });
    };

    await startListening();
    logger.info('Server initialization complete');

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server with proper error handling
startServer().catch((error) => {
  logger.error('Critical server error:', error);
  process.exit(1);
});