import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

const app = express();

// Global error handler for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));

// Add request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

app.use((req, res, next) => {
  const requestId = Date.now().toString(36);
  const start = Date.now();
  const path = req.path;

  // Monitor memory usage
  const memoryStart = process.memoryUsage();

  console.log(`[API] ${req.method} ${path} started`, {
    requestId,
    query: req.query,
    body: req.body,
    headers: req.headers
  });
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
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

    console.error("[ERROR]", JSON.stringify(errorInfo));

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

  process.env.NODE_ENV = 'production';
  const PORT = parseInt(process.env.PORT || '3001', 10);
  const MAX_PORT_ATTEMPTS = 5;

  const startServer = async (attempt = 0) => {
    try {
      const port = PORT + attempt;
      console.log(`Attempting to start server on port ${port}...`);
      
      // Close any existing connections
      if (httpServer.listening) {
        await new Promise(resolve => httpServer.close(resolve));
      }

      const server = httpServer.listen(port, '0.0.0.0', () => {
        console.log(`Server running on port ${port} (http://0.0.0.0:${port})`);
      });

      server.on('error', async (err) => {
        console.error('Server error:', err);
        if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
          console.log(`Port ${port} in use, trying ${port + 1}`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
          startServer(attempt + 1);
        } else {
          console.error('Could not start server:', err);
          process.exit(1);
        }
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
          console.log(`Port ${port} in use, trying ${port + 1}`);
          server.close();
          startServer(attempt + 1);
        } else {
          console.error('Server error:', err);
          process.exit(1);
        }
      });
    } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  };

  // Enable trust proxy for secure cookies
  app.set('trust proxy', 1);

  // Ensure all routes are properly handled
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  startServer(0).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
})();