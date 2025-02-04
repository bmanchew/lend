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
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return (typeof forwarded === 'string' ? forwarded : req.ip) || req.ip;
  }
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

// Static file serving and SPA handling
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist/public'));
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

// Function to check if port is ready
const checkPort = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const testServer = createServer()
      .once('error', () => {
        testServer.close();
        resolve(false);
      })
      .once('listening', () => {
        testServer.close();
        resolve(true);
      })
      .listen(port, '0.0.0.0');
  });
};

// Start the server with port availability check
const startServer = async () => {
  try {
    console.log(`[SERVER] Checking port ${PORT} availability...`);
    const isPortAvailable = await checkPort(PORT);
    if (!isPortAvailable) {
      console.error(`[SERVER] Port ${PORT} is already in use`);
      process.exit(1);
    }

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log('[SERVER] Environment:', process.env.NODE_ENV);
      console.log(`[SERVER] Application started on port ${PORT}`);
      console.log(`[SERVER] Server is ready to accept connections`);

      // Signal that the server is ready
      if (process.send) {
        process.send('ready');
      }
    });

    // Handle server errors
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`[SERVER] Port ${PORT} is already in use`);
        process.exit(1);
      }
      console.error('[SERVER] Server error:', error);
    });

    // Signal readiness after a short delay to ensure everything is initialized
    setTimeout(() => {
      if (process.send) {
        process.send('ready');
      }
    }, 1000);

  } catch (error) {
    console.error('[SERVER] Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer().catch(error => {
  console.error('[SERVER] Failed to start server:', error);
  process.exit(1);
});

export { app, httpServer as server };