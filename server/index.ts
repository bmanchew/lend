import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import apiRouter from "./routes";
import { setupVite } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { setupAuth } from "./auth";
import { logger } from "./lib/logger";

// Essential middleware
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize authentication first
await setupAuth(app);

// Mount API routes under /api prefix BEFORE Vite setup
app.use("/api", apiRouter);

const PORT = process.env.PORT || 3000;
let server: Server | null = null;

const startServer = async () => {
  try {
    // Create HTTP server
    const httpServer = createServer(app);

    // Start HTTP server first
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(PORT, "0.0.0.0", () => {
        logger.info(`Server listening on port ${PORT}`);
        resolve();
      });

      httpServer.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${PORT} is already in use`);
          reject(new Error(`Port ${PORT} is already in use`));
        } else {
          logger.error("Failed to start server:", error);
          reject(error);
        }
      });
    });

    // Setup Vite AFTER server is listening
    await setupVite(app, httpServer);

    // Socket.IO setup
    const io = new Server(httpServer, {
      cors: { origin: "*" },
      path: '/socket.io/'
    });

    server = io;

    io.on('connection', (socket) => {
      const socketContext = {
        component: 'socket.io',
        socketId: socket.id,
        transport: socket.conn.transport.name,
        remoteAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      };

      logger.info("Socket connected:", socketContext);

      socket.on('join_merchant_room', (merchantId: number) => {
        const roomName = `merchant_${merchantId}`;
        socket.join(roomName);
        logger.info("Joined merchant room:", { merchantId, roomName, socketId: socket.id });
      });

      socket.on('error', (error: Error) => {
        logger.error("Socket error:", { error: error.message, socketId: socket.id });
      });

      socket.on('disconnect', (reason) => {
        logger.info("Socket disconnected:", { reason, socketId: socket.id });
      });
    });

  } catch (error: any) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Cleanup function
const cleanup = () => {
  if (server) {
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

// Handle cleanup
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error("Uncaught exception:", error);
  cleanup();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error("Unhandled rejection:", reason);
  cleanup();
});

startServer().catch((error) => {
  logger.error("Critical server error:", error);
  cleanup();
});