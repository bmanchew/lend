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

// Essential middleware
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add health check endpoint
app.get('/health', (_, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Initialize authentication first
await setupAuth(app);

// Mount API routes under /api prefix BEFORE Vite setup
app.use("/api", apiRouter);

interface SocketError extends Error {
  data?: any;
}

const startServer = async () => {
  try {
    // Create HTTP server
    const httpServer = createServer(app);

    // Find available port, starting from 3000
    const port = await portfinder.getPortPromise({
      port: 3000,
      host: '0.0.0.0',
      stopPort: 9000
    });

    // Set default timeout
    httpServer.timeout = 120000; // 2 minutes
    httpServer.keepAliveTimeout = 65000; // slightly higher than 60 seconds

    // Start HTTP server first and wait for it to be ready
    await new Promise<void>((resolve, reject) => {
      try {
        httpServer.listen(port, "0.0.0.0", () => {
          // Log both to console and logger for workflow detection
          console.log(`Server running at http://0.0.0.0:${port}`);
          console.log(`Health check available at http://0.0.0.0:${port}/health`);
          logger.info(`Server listening on port ${port}`, {
            port,
            host: '0.0.0.0',
            timestamp: new Date().toISOString()
          });
          process.env.PORT = port.toString();
          resolve();
        });

        httpServer.on('error', (err) => {
          const errorDetails = {
            message: err.message,
            stack: err.stack,
            code: err.code,
            timestamp: new Date().toISOString()
          };
          logger.error('Server startup error:', errorDetails);
          console.error('Failed to start server:', errorDetails);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });

    // Setup Vite AFTER server is listening
    await setupVite(app, httpServer);

    // Socket.IO setup with proper error handling
    const io = new Server(httpServer, {
      cors: { origin: "*" },
      path: '/socket.io/'
    });

    (global as any).io = io;

    io.on('connection', (socket) => {
      const socketContext = {
        socketId: socket.id,
        transport: socket.conn.transport.name,
        remoteAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        timestamp: new Date().toISOString()
      };

      logger.info("Socket connected:", socketContext);

      socket.on('join_merchant_room', (merchantId: number) => {
        const roomName = `merchant_${merchantId}`;
        socket.join(roomName);
        logger.info("Joined merchant room:", { merchantId, roomName, socketId: socket.id });
      });

      socket.on('error', (error: SocketError) => {
        logger.error("Socket error:", { 
          message: error.message,
          data: error.data,
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });
      });

      socket.on('disconnect', (reason) => {
        logger.info("Socket disconnected:", { 
          reason, 
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });
      });
    });

    // Signal that the server is ready for connections
    console.log("✨ Server is ready for connections");
    logger.info("Server is ready for connections", {
      port,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error("Failed to start server:", {
      message: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString()
    });

    process.exit(1);
  }
};

// Handle startup errors
startServer().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error("Critical server error:", {
    message: errorMessage,
    stack: errorStack,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error("Uncaught exception:", {
    message: error.message,
    stack: error.stack,
    name: error.name,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error("Unhandled rejection:", {
    message: error.message,
    stack: error.stack,
    name: error.name,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info("Graceful shutdown initiated", {
    timestamp: new Date().toISOString()
  });
  process.exit(0);
});