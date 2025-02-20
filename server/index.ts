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
setupAuth(app);

// Mount API routes under /api prefix BEFORE Vite setup
app.use("/api", apiRouter);

// Add type for SocketError
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
            code: (err as NodeJS.ErrnoException).code,
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

// Start the server
startServer().catch((error) => {
  logger.error("Critical server error:", {
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
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