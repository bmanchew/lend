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
    let port: number;

    try {
      port = await findAvailablePort(preferredPort);
    } catch (error) {
      logger.error('Failed to find available port:', error);
      process.exit(1);
    }

    // Initialize LedgerManager in background if Plaid is configured
    if (process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET && process.env.PLAID_ENV) {
      try {
        const ledgerConfig = {
          minBalance: 1000,
          maxBalance: 100000,
          sweepThreshold: 500,
          sweepSchedule: '0 */15 * * * *' // Every 15 minutes
        };

        const ledgerManager = LedgerManager.getInstance(ledgerConfig);
        // Make this non-blocking
        ledgerManager.initializeSweeps().catch(error => {
          logger.warn('Ledger sweeps initialization had issues:', error);
        });
      } catch (error) {
        logger.warn('Failed to initialize ledger manager:', error);
        // Continue server startup even if ledger manager fails
      }
    } else {
      logger.warn('Plaid integration not fully configured - ledger sweeps will be disabled');
    }

    // Add health check endpoint before starting server
    app.get('/health', (_req, res) => {
      res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        port,
        timestamp: new Date().toISOString()
      });
    });

    const maxRetries = 5;
    let currentRetry = 0;

    const startListening = async (): Promise<void> => {
      try {
        await new Promise<void>((resolve, reject) => {
          const server = httpServer.listen(port, "0.0.0.0", () => {
            logger.info(`Server is running on port ${port}`);
            logger.info(`Server URL: http://0.0.0.0:${port}`);
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
          }).on('error', async (err: any) => {
            if (err.code === 'EADDRINUSE' && currentRetry < maxRetries) {
              currentRetry++;
              logger.warn(`Port ${port} in use, retrying... (attempt ${currentRetry}/${maxRetries})`);

              // Close the server and try the next port
              server.close();
              port = await findAvailablePort(port + 1);
              startListening().then(resolve).catch(reject);
            } else {
              logger.error('Server failed to start:', err);
              reject(err);
            }
          });
        });
      } catch (error) {
        if (currentRetry >= maxRetries) {
          throw new Error(`Failed to start server after ${maxRetries} attempts`);
        }
        throw error;
      }
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