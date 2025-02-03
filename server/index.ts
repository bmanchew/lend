import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { createServer } from 'http'; // Added import for createServer

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

import winston from 'winston';
import toobusy from 'toobusy-js';

// Configure Winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Configure toobusy
toobusy.maxLag(70);

const app = express();
const PORT = process.env.PORT || 3001;
const VITE_PORT = process.env.VITE_PORT || 3000;

// Middleware to prevent requests when server is too busy
app.use((req, res, next) => {
  if (toobusy()) {
    res.status(503).send("Server too busy!");
  } else {
    next();
  }
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  const requestId = req.headers['x-request-id'] || Date.now().toString(36);
  
  // Handle auth errors specifically
  if (err.name === 'UnauthorizedError' || err.status === 401) {
    logger.error(`[Auth][${requestId}] Unauthorized access:`, err);
    return res.status(401).json({
      error: 'Unauthorized access',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Authentication required'
    });
  }

  // Log all errors
  logger.error(`[Error][${requestId}]`, {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path
  });

  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
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
  res.json = function(body: any, ...args) {
    capturedResponse = body;
    return originalJson.apply(res, [body, ...args]);
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

(async () => {
  // Register API routes first
  const httpServer = registerRoutes(app); // Assumed registerRoutes returns the httpServer

  // Make io globally available
  declare global {
    var io: Server;
  }
  // Global io will be initialized in routes.ts after server creation

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

    console.error("[ERROR]", JSON.stringify(errorInfo));

    if (!res.headersSent) {
      res.status(err.status || 500).json({
        status: "error",
        message: err.message || "Internal Server Error",
        errorId
      });
    }
  });

  // Error handling for HTTP server
  httpServer.on('error', (error) => {
    console.error('Server error:', error);
    // Attempt recovery
    setTimeout(() => {
      httpServer.close(() => {
        httpServer.listen(PORT, '0.0.0.0');
      });
    }, 1000);
  });


  // Setup Vite/static serving last
  if (app.get("env") === "development") {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }

  const portfinder = await import('portfinder');

  // Configure portfinder
  const PORT = await portfinder.getPortPromise({
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    stopPort: 9000
  });
  httpServer.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
    // Log successful startup
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log('Environment:', process.env.NODE_ENV);
    console.log('WebSocket status: enabled');
  });

  //Improve error handling - already added above.

})();