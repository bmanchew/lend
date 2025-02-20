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

// Initialize authentication first
await setupAuth(app);

// Mount API routes under /api prefix
app.use("/api", apiRouter);

const startServer = async () => {
  try {
    // Create HTTP server
    const httpServer = createServer(app);

    // Find available port
    const port = await portfinder.getPortPromise({
      port: Number(process.env.PORT) || 3000
    });

    // Start HTTP server first
    await new Promise<void>((resolve) => {
      httpServer.listen(port, "0.0.0.0", () => {
        logger.info(`Server listening on port ${port}`);
        process.env.PORT = port.toString();
        resolve();
      });
    });

    // Setup Vite after server is listening and after API routes are mounted
    await setupVite(app, httpServer);

    // Socket.IO setup
    const io = new Server(httpServer, {
      cors: { origin: "*" },
      path: '/socket.io/'
    });

    (global as any).io = io;

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
        logger.error("Socket error:", { error, socketId: socket.id });
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

startServer().catch((error) => {
  logger.error("Critical server error:", error);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error("Uncaught exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error("Unhandled rejection:", reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info("Graceful shutdown initiated");
  process.exit(0);
});