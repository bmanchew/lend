import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { setupAuth } from "./auth";
import { logger } from "./lib/logger";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
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

  console.log(`[API] ${req.method} ${path} started`, {
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

      log(JSON.stringify(logData));
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

    // Enterprise error handling middleware
    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const errorId = Date.now().toString(36);
      const errorInfo = {
        id: errorId,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
        userId: req.body?.userId || 'anonymous',
        error: {
          name: err.name,
          message: err.message,
          stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
        }
      };

      logger.error("[ERROR]", errorInfo);

      if (!res.headersSent) {
        res.status(err.status || 500).json({
          status: "error",
          message: err.message || "Internal Server Error",
          errorId
        });
      }
    });

    // Setup Vite/static serving last
    if (app.get("env") === "development") {
      await setupVite(app, httpServer);
    } else {
      serveStatic(app);
    }

    const portfinder = await import('portfinder');

    // Configure portfinder with base port
    const PORT = await portfinder.getPortPromise({
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
      stopPort: 9000
    });

    // Start server and wait for port to be available
    await new Promise<void>((resolve, reject) => {
      const server = httpServer.listen(PORT, "0.0.0.0", () => {
        log(`Server running at http://0.0.0.0:${PORT}`);
        console.log('Environment:', process.env.NODE_ENV);
        console.log('WebSocket status: enabled');
        resolve();
      }).on('error', reject);

      // Initialize Socket.IO after server is running
      const io = new Server(server, {
        cors: { origin: "*" },
        path: '/socket.io/'
      });

      // Make io globally available
      (global as any).io = io;

      io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        socket.on('join_merchant_room', (merchantId: number) => {
          socket.join(`merchant_${merchantId}`);
          console.log(`Socket ${socket.id} joined merchant room ${merchantId}`);
        });

        socket.on('disconnect', () => {
          console.log('Client disconnected:', socket.id);
        });
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    logger.error('Server startup error:', error);
    process.exit(1);
  }
};

// Start server with proper error handling
startServer().catch((error) => {
  console.error('Critical server error:', error);
  logger.error('Critical server error:', error);
  process.exit(1);
});