import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';

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
  const httpServer = registerRoutes(app);

  // Initialize Socket.IO with proper upgrade handling
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    path: "/socket.io/",
    transports: ["websocket", "polling"],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    allowRequest: (req, callback) => {
      callback(null, true);
    }
  });

  // Single connection handler
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_merchant_room', (merchantId) => {
      socket.join(`merchant_${merchantId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });


  // Make io globally available
  declare global {
    var io: Server;
  }
  global.io = io;

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

  const tryPort = async (startPort: number): Promise<number> => {
    for (let port = startPort; port < startPort + 10; port++) {
      try {
        await new Promise((resolve, reject) => {
          const server = httpServer.listen(port, "0.0.0.0", () => {
            server.close();
            resolve(port);
          });
          server.on('error', reject);
        });
        return port;
      } catch (err) {
        if (port === startPort + 9) throw err;
      }
    }
    throw new Error('No available ports found');
  };

  const PORT = await tryPort(3000);
  httpServer.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
    // Log successful startup
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log('Environment:', process.env.NODE_ENV);
    console.log('WebSocket status: enabled');
  });

  // Improve error handling
  httpServer.on('error', (error: Error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
})();