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

// Add logging middleware
app.use(requestLoggingMiddleware);
app.use(performanceLoggingMiddleware);

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

    // Setup auth first (this adds the session middleware)
    logger.info('Setting up authentication...', {
      component: 'server',
      action: 'auth_setup'
    });
    await setupAuth(app);
    logger.info('Authentication setup completed', {
      component: 'server',
      action: 'auth_setup_complete'
    });

    // Mount API routes after auth setup
    app.use(apiRouter);

    // Setup Vite last
    logger.info('Setting up Vite...', {
      component: 'server',
      action: 'vite_setup'
    });
    await setupVite(app, httpServer);
    logger.info('Vite setup completed', {
      component: 'server',
      action: 'vite_setup_complete'
    });

    // Error handling middleware
    app.use(errorLoggingMiddleware);

    // Find available port
    const port = await portfinder.getPortPromise({ 
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000 
    });

    // Wait for port to be available before starting
    await waitForPort(port);

    // Start server
    httpServer.listen(port, "0.0.0.0", () => {
      const duration = logger.endTimer(startTime);
      logger.info('Server startup completed', {
        component: 'server',
        action: 'startup_complete',
        url: `http://0.0.0.0:${port}`,
        startupDuration: duration,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      });

      // Make port available to other processes
      process.env.PORT = port.toString();
    });

    // Initialize Socket.IO with enhanced logging
    const io = new Server(httpServer, {
      cors: { origin: "*" },
      path: '/socket.io/',
      transports: ['websocket', 'polling']
    });

    (global as any).io = io;

    // Enhanced Socket.IO logging
    io.on('connection', (socket) => {
      const socketContext = {
        component: 'socket.io',
        socketId: socket.id,
        transport: socket.conn.transport.name,
        remoteAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      };

      logger.info('Socket client connected', {
        ...socketContext,
        action: 'client_connect',
        query: socket.handshake.query
      });

      socket.on('join_merchant_room', (merchantId: number) => {
        const roomName = `merchant_${merchantId}`;
        socket.join(roomName);
        logger.info('Socket joined merchant room', {
          ...socketContext,
          action: 'join_room',
          merchantId,
          room: roomName,
          currentRooms: Array.from(socket.rooms)
        });
      });

      socket.on('error', (error: Error) => {
        logger.error('Socket error occurred', error, {
          ...socketContext,
          action: 'socket_error'
        });
      });

      socket.on('disconnect', (reason) => {
        logger.info('Socket client disconnected', {
          ...socketContext,
          action: 'client_disconnect',
          reason,
          duration: socket.conn.transport.name 
        });
      });
    });

  } catch (error: any) {
    logger.fatal('Server startup failed', error, {
      component: 'server',
      action: 'startup_failed',
      startupDuration: logger.endTimer(startTime),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    });
    process.exit(1);
  }
};

// Handle uncaught exceptions with enhanced context
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception detected', error, {
    component: 'process',
    action: 'uncaught_exception',
    type: 'uncaughtException',
    processUptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage()
  });
  process.exit(1);
});

// Handle unhandled promise rejections with enhanced context
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled Rejection detected', reason instanceof Error ? reason : new Error(String(reason)), {
    component: 'process',
    action: 'unhandled_rejection',
    type: 'unhandledRejection',
    processUptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage()
  });
  process.exit(1);
});

// Graceful shutdown with enhanced logging
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, starting graceful shutdown', {
    component: 'process',
    action: 'graceful_shutdown',
    processUptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage()
  });
  process.exit(0);
});

startServer().catch((error) => {
  logger.fatal('Critical server error', error, {
    component: 'server',
    action: 'critical_error',
    processUptime: process.uptime(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage()
  });
  process.exit(1);
});