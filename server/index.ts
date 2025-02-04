import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';

// Use environment port or fallback to 5000
const PORT = parseInt(process.env.PORT || '5000', 10);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip
});

// Apply rate limiting to auth routes
app.use('/api/auth', limiter);
app.use('/api/login', limiter);
app.use('/api/register', limiter);

const app = express();

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('[SERVER] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Unhandled Rejection:', reason);
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
      const logData = {
        method: req.method,
        path,
        status: res.statusCode,
        duration: `${duration}ms`,
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB'
        },
        response: capturedResponse
      };
      console.log(JSON.stringify(logData));
    }
  });

  next();
};

app.use(requestLogger);

// Register API routes first
registerRoutes(app);

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

// Create HTTP server
const httpServer = createServer(app);

// Setup Vite/static serving last
if (app.get("env") === "development") {
  setupVite(app, httpServer).then(() => {
    // Start server after Vite is set up
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log('[SERVER] Environment:', process.env.NODE_ENV);
      console.log(`[SERVER] Application started on port ${PORT}`);
      console.log(`[SERVER] Server URL: http://0.0.0.0:${PORT}`);
    });
  }).catch(error => {
    console.error('[SERVER] Failed to setup Vite:', error);
    process.exit(1);
  });
} else {
  serveStatic(app);
  // Start server directly in production
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('[SERVER] Environment:', process.env.NODE_ENV);
    console.log(`[SERVER] Application started on port ${PORT}`);
    console.log(`[SERVER] Server URL: http://0.0.0.0:${PORT}`);
  });
}

// Handle server errors
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[SERVER] Port ${PORT} is already in use`);
    process.exit(1);
  }
  console.error('[SERVER] Server error:', error);
});

// Export for testing
export { app, httpServer as server };