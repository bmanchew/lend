import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import path from 'path';

const app = express();

// Use environment port or fallback to 5000
const PORT = parseInt(process.env.PORT || '5000', 10);

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip
});

// Apply rate limiting to auth routes
app.use('/api/auth', limiter);
app.use('/api/login', limiter);
app.use('/api/register', limiter);

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('[SERVER] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Unhandled Rejection:', reason);
});

// Middleware setup
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const path = req.path;

  // Clean headers for logging
  const safeHeaders = { ...req.headers };
  delete safeHeaders.authorization;
  delete safeHeaders.cookie;

  console.log(`[API] ${req.method} ${path} started`, {
    query: req.query,
    headers: safeHeaders,
    timestamp: new Date().toISOString()
  });

  // Log response on finish
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      console.log(`[API] ${req.method} ${path} completed`, {
        status: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
    }
  });

  next();
};

app.use(requestLogger);

// Register API routes
registerRoutes(app);

// Serve static files
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist/public'));

  // Handle SPA routing
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      try {
        res.sendFile(path.resolve(__dirname, '../dist/public/index.html'));
      } catch (err) {
        next(err);
      }
    } else {
      next();
    }
  });
} else {
  // In development, serve from the client directory
  app.use(express.static('client/dist'));
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      try {
        res.sendFile(path.resolve(__dirname, '../client/dist/index.html'));
      } catch (err) {
        next(err);
      }
    } else {
      next();
    }
  });
}

// Error handling middleware
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERROR]", {
    error: err,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  if (!res.headersSent) {
    res.status(err.status || 500).json({
      status: "error",
      message: err.message || "Internal Server Error"
    });
  }
});

// Create HTTP server
const httpServer = createServer(app);

// Start the server
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('[SERVER] Environment:', process.env.NODE_ENV);
  console.log(`[SERVER] Application started on port ${PORT}`);
});

// Handle server errors
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[SERVER] Port ${PORT} is already in use`);
    process.exit(1);
  }
  console.error('[SERVER] Server error:', error);
});

export { app, httpServer as server };