import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import apiRouter from "./routes";
import { setupVite } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { setupAuth } from "./auth";
import { logger } from "./lib/logger";
import portfinder from 'portfinder';
import { createServer as createNetServer } from 'net';
import {
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  performanceLoggingMiddleware
} from './middleware/logging';
import { auditLoggingMiddleware } from './middleware/audit-logging';
import { createDBLogger } from './middleware/db-logging';
import { createFileLogger } from './middleware/file-logging';
import { authLoggingMiddleware } from './middleware/auth-logging';
import { createCacheLogger, createLoggingCache } from './middleware/cache-logging';
import { businessEventMiddleware } from './middleware/business-events';
import NodeCache from 'node-cache';

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 1000, // Set very high for testing
  message: { error: "Too many requests from this IP, please try again later" }
});

const app = express();

// Essential middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(limiter);

// Initialize loggers
const dbLogger = createDBLogger();
const fileLogger = createFileLogger();

// Initialize cache with logging
const cache = createLoggingCache(new NodeCache({ stdTTL: 600 }));

// Add comprehensive logging middleware
app.use(requestLoggingMiddleware);
app.use(performanceLoggingMiddleware);
app.use(auditLoggingMiddleware);
app.use(authLoggingMiddleware);
app.use(businessEventMiddleware); // Add business event tracking

// Function to check if a port is available
const isPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = createNetServer()
      .once('error', () => {
        resolve(false);
      })
      .once('listening', () => {
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      })
      .listen(port, '0.0.0.0');
  });
};

// Function to wait for port to be available
const waitForPort = async (port: number, retries = 20, interval = 250): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    const available = await isPortAvailable(port);
    if (available) {
      logger.info('Port availability confirmed', { port });
      return;
    }
    logger.debug('Waiting for port', { port, attempt: i + 1, maxRetries: retries });
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Port ${port} is not available after ${retries} retries`);
};

const startServer = async () => {
  const startTime = logger.startTimer();
  try {
    // Create HTTP server
    const httpServer = createServer(app);

    logger.info('Setting up authentication...', {
      component: 'server',
      action: 'auth_setup'
    });

    // Setup authentication
    await setupAuth(app);

    logger.logBusinessEvent('auth_setup', 'system', 'success', {
      timestamp: new Date().toISOString()
    });

    // Mount API routes
    app.use(apiRouter);

    // Setup Vite
    logger.info('Setting up Vite...', {
      component: 'server',
      action: 'vite_setup'
    });

    await setupVite(app, httpServer);

    logger.logBusinessEvent('vite_setup', 'system', 'success', {
      timestamp: new Date().toISOString()
    });

    // Error handling middleware
    app.use(errorLoggingMiddleware);

    // Find available port
    const port = await portfinder.getPortPromise({
      port: Number(process.env.PORT) || 3000
    });

    // Wait for port to be available
    await waitForPort(port);

    // Socket.IO setup with enhanced logging
    const io = new Server(httpServer, {
      cors: { origin: "*" },
      path: '/socket.io/',
      transports: ['websocket', 'polling']
    });

    (global as any).io = io;

    // Enhanced Socket.IO logging with business events
    io.on('connection', (socket) => {
      const socketContext = {
        component: 'socket.io',
        socketId: socket.id,
        transport: socket.conn.transport.name,
        remoteAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      };

      logger.logSocketEvent('connection', socket.id, {
        transport: socket.conn.transport.name,
        query: socket.handshake.query
      });

      socket.on('join_merchant_room', (merchantId: number) => {
        const roomName = `merchant_${merchantId}`;
        socket.join(roomName);

        logger.logSocketEvent('join_merchant_room', socket.id, {
          merchantId,
          room: roomName,
          currentRooms: Array.from(socket.rooms)
        });

        logger.logBusinessEvent('merchant_room_join', 'socket', 'success', {
          merchantId,
          socketId: socket.id,
          room: roomName
        });
      });

      socket.on('error', (error: Error) => {
        logger.logSocketEvent('error', socket.id, undefined, error);

        logger.logBusinessEvent('socket_error', 'socket', 'failure', {
          socketId: socket.id,
          error: {
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
          }
        });
      });

      socket.on('disconnect', (reason) => {
        logger.logSocketEvent('disconnect', socket.id, {
          reason,
          duration: socket.conn.transport.name
        });
      });
    });

    // Start HTTP server
    httpServer.listen(port, "0.0.0.0", () => {
      const duration = logger.endTimer(startTime);
      logger.logBusinessEvent('server_startup', 'system', 'success', {
        port,
        startupDuration: duration,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
      });
      process.env.PORT = port.toString();
    });

  } catch (error: any) {
    logger.logBusinessEvent('server_startup', 'system', 'failure', {
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.logBusinessEvent('uncaught_exception', 'process', 'failure', {
    error: {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.logBusinessEvent('unhandled_rejection', 'process', 'failure', {
    error: reason instanceof Error ? {
      message: reason.message,
      stack: process.env.NODE_ENV === 'development' ? reason.stack : undefined
    } : { message: String(reason) }
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.logBusinessEvent('graceful_shutdown', 'process', 'success', {
    processUptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
  process.exit(0);
});

startServer().catch((error) => {
  logger.logBusinessEvent('critical_error', 'server', 'failure', {
    error: {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    processUptime: process.uptime(),
    nodeVersion: process.version
  });
  process.exit(1);
});

// Export loggers and middleware for use in other parts of the application
export { dbLogger, fileLogger, cache, createCacheLogger, authLoggingMiddleware };