import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io'; // Changed import to be explicit about Socket.IO Server
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

// Configure toobusy with more lenient threshold
toobusy.maxLag(100);
toobusy.interval(500); // Check less frequently

const app = express();
import { createServer as netCreateServer } from 'net';
const getAvailablePort = async (startPort: number, maxAttempts = 10): Promise<number> => {
  if (maxAttempts <= 0) {
    throw new Error('Could not find an available port after maximum attempts');
  }
  return new Promise((resolve, reject) => {
    const server = netCreateServer();
    server.unref();
    server.on('error', () => {
      console.log(`Port ${startPort} in use, trying ${startPort + 1}...`);
      resolve(getAvailablePort(startPort + 1, maxAttempts - 1));
    });
    server.listen(startPort, '0.0.0.0', () => {
      const { port } = server.address() as any; // Type assertion needed here
      server.close(() => resolve(port));
    });
  });
};

const PORT = await getAvailablePort(3001);
const API_PORT = process.env.API_PORT || PORT;
const CLIENT_PORT = process.env.CLIENT_PORT || 5173;
console.log(`Server will start on port: ${PORT}`);

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Performing graceful shutdown...');
  process.exit(0);
});

// Memory monitoring
setInterval(() => {
  const used = process.memoryUsage();
  console.log('Memory usage:', {
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`
  });
}, 300000);

// Add request timeout
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    res.status(408).send('Request timeout');
  });
  next();
});

// Add circuit breaker
let requestCount = 0;
const MAX_REQUESTS = 1000;
const RESET_INTERVAL = 60000;

setInterval(() => {
  requestCount = 0;
}, RESET_INTERVAL);

app.use((req, res, next) => {
  if (requestCount > MAX_REQUESTS) {
    return res.status(503).send('Server too busy');
  }
  requestCount++;
  next();
});

// Enhanced busy server handling with retry header
app.use((req, res, next) => {
  if (toobusy()) {
    res.set('Retry-After', '5');
    res.status(503).json({
      error: "Server is experiencing high load",
      retryAfter: 5
    });
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
  const httpServer = createServer(app); // Assuming registerRoutes modifies app in place.  If not, adjust.

  // Make io globally available
  declare global {
    var io: SocketIOServer;
  }
  // Global io will be initialized in routes.ts after server creation

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
      credentials: true,
      allowedHeaders: ["*"]
    },
    transports: ['polling', 'websocket'],
    pingTimeout: 10000,
    connectTimeout: 10000,
    debug: true,
    pingInterval: 5000,
    allowUpgrades: true,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1e6
  });

  // Detailed connection logging
  io.engine.on("connection", (socket) => {
    console.log("[WebSocket] New connection:", {
      id: socket.id,
      transport: socket.transport.name,
      headers: socket.request.headers,
      ip: socket.request.connection.remoteAddress,
      time: new Date().toISOString()
    });
  });

  io.engine.on("upgrade", (req) => {
    console.log("[WebSocket] Upgrade attempt:", {
      headers: req.headers,
      url: req.url,
      method: req.method,
      time: new Date().toISOString()
    });
  });

  io.engine.on("upgradeError", (err) => {
    console.error("[WebSocket] Upgrade failed:", {
      error: err.message,
      code: err.code,
      type: err.type,
      time: new Date().toISOString()
    });
  });

  // Enhanced WebSocket logging
  io.engine.on("connection_error", (err) => {
    console.error('[WebSocket] Connection error:', {
      type: err.type,
      description: err.description,
      context: err.context,
      timestamp: new Date().toISOString(),
      headers: err.req?.headers,
      url: err.req?.url,
      method: err.req?.method,
      transport: io.engine.transport?.name,
      state: io.engine.state,
      protocol: err.req?.protocol,
      remoteAddress: err.req?.socket?.remoteAddress
    });
  });

  // Log transport changes
  io.engine.on("transport", (transport) => {
    console.log('[WebSocket] Transport change:', {
      transport: transport.name,
      uri: transport.uri,
      timestamp: new Date().toISOString(),
      state: io.engine.state
    });
  });

  // Log packet events
  io.engine.on("packet", (packet) => {
    console.log('[WebSocket] Packet:', {
      type: packet.type,
      data: packet.data,
      timestamp: new Date().toISOString()
    });
  });

  io.engine.on("upgrade_error", (err) => {
    console.error('[WebSocket] Upgrade error:', {
      error: err,
      timestamp: new Date().toISOString()
    });
  });

  io.engine.on("initial_headers", (headers, req) => {
    console.log("[WebSocket] Initial headers:", {
      headers,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  });


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

  // Improved HTTP server error handling
  httpServer.on('error', (error) => {
    console.error('[Server] Error:', {
      error: error.message,
      code: error.code,
      syscall: error.syscall,
      timestamp: new Date().toISOString()
    });
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

  // Use consistent port configuration
  httpServer.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
    // Log successful startup
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log('Environment:', process.env.NODE_ENV);
    console.log('WebSocket status: enabled');
  });

  //Improve error handling - already added above.

})();