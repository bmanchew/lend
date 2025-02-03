import type { Express } from "express";
import { createServer } from "http";
import { db } from "@db";
import { contracts, merchants, users, verificationSessions, webhookEvents, programs } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import express from 'express';
import { setupAuth } from "./auth";
import { diditService } from "./services/didit";
import { smsService } from "./services/sms";
import { logger } from "./lib/logger";
import { setupSocketIO } from "./services/socket";
import { APIError, errorHandler } from "./middleware/error";
import { requestLogger } from "./middleware/logging";
import { validateRequest } from "./middleware/validation";
import { 
  merchantRoutes,
  contractRoutes, 
  kycRoutes,
  authRoutes
} from "./routes/";

export function registerRoutes(app: Express) {
  const apiRouter = express.Router();

  // Global middleware
  app.use(requestLogger);

  // Setup authentication
  setupAuth(app);

  // Register route modules
  apiRouter.use("/merchants", merchantRoutes);
  apiRouter.use("/contracts", contractRoutes);
  apiRouter.use("/kyc", kycRoutes);
  apiRouter.use("/auth", authRoutes);

  // Setup error handling
  app.use(errorHandler);

  // Mount API routes
  app.use("/api", apiRouter);

  // Create HTTP server
  const httpServer = createServer(app);

  // Setup WebSocket
  setupSocketIO(httpServer);

  return httpServer;
}