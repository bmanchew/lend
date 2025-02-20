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

const initializeServer = async () => {
  const app = express();

  // Essential middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Initialize authentication
  await setupAuth(app);
  app.use("/api", apiRouter);

  const httpServer = createServer(app);

  const port = await portfinder.getPortPromise({
    port: 3000,
    host: '0.0.0.0',
    stopPort: 9000
  });

  // Server configuration
  httpServer.timeout = 120000; // 2 minutes
  httpServer.keepAliveTimeout = 65000;

  // Start server
  await new Promise<void>((resolve, reject) => {
    try {
      httpServer.listen(port, "0.0.0.0", () => {
        logger.info(`Server listening on port ${port}`);
        process.env.PORT = port.toString();
        resolve();
      });

      httpServer.on('error', (err) => {
        logger.error('Server startup error:', { error: err.message, stack: err.stack });
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });

  // Setup Vite
  await setupVite(app, httpServer);

  // Socket.IO setup
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    path: '/socket.io/'
  });

  (global as any).io = io;

  io.on('connection', handleSocketConnection);

  logger.info("Server is ready for connections");
  return { app, httpServer, io };
};

const handleSocketConnection = (socket: any) => {
  const socketContext = {
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

  socket.on('error', (error: Error & { data?: any }) => {
    logger.error("Socket error:", { 
      message: error.message,
      data: error.data,
      socketId: socket.id 
    });
  });

  socket.on('disconnect', (reason: string) => {
    logger.info("Socket disconnected:", { reason, socketId: socket.id });
  });
};

// Error handling
process.on('uncaughtException', (error: Error) => {
  logger.error("Uncaught exception:", {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error("Unhandled rejection:", {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info("Graceful shutdown initiated");
  process.exit(0);
});

// Start server
initializeServer().catch((error) => {
  logger.error("Critical server error:", {
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
});