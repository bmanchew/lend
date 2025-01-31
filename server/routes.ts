import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users } from "@db/schema";
import { eq } from "drizzle-orm";
import { setupAuth } from "./auth.js";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Customer routes
  app.get("/api/customers/:id/contracts", async (req, res, next) => {
    try {
      const customerContracts = await db.query.contracts.findMany({
        where: eq(contracts.customerId, parseInt(req.params.id)),
        with: {
          merchant: true,
        },
      });
      res.json(customerContracts);
    } catch (err) {
      next(err);
    }
  });

  // Merchant routes
  app.get("/api/merchants/by-user/:userId", async (req, res, next) => {
    try {
      const [merchant] = await db.query.merchants.findMany({
        where: eq(merchants.userId, parseInt(req.params.userId)),
      });
      res.json(merchant);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/merchants/:id/contracts", async (req, res, next) => {
    try {
      const merchantContracts = await db.query.contracts.findMany({
        where: eq(contracts.merchantId, parseInt(req.params.id)),
        with: {
          customer: true,
        },
      });
      res.json(merchantContracts);
    } catch (err) {
      next(err);
    }
  });

  // Admin routes
  app.get("/api/merchants", async (req, res, next) => {
    try {
      const allMerchants = await db.query.merchants.findMany({
        with: {
          user: true,
        },
      });
      res.json(allMerchants);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/contracts", async (req, res, next) => {
    try {
      const allContracts = await db.query.contracts.findMany({
        with: {
          merchant: true,
          customer: true,
        },
      });
      res.json(allContracts);
    } catch (err) {
      next(err);
    }
  });

  // Global error handler
  app.use((err: any, _req: any, res: any, next: any) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  const httpServer = createServer(app);
  return httpServer;
}