import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users } from "@db/schema";
import { eq } from "drizzle-orm";
import { setupAuth } from "./auth";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Customer routes
  app.get("/api/customers/:id/contracts", async (req, res) => {
    const contracts = await db.query.contracts.findMany({
      where: eq(contracts.customerId, parseInt(req.params.id)),
    });
    res.json(contracts);
  });

  // Merchant routes
  app.get("/api/merchants/by-user/:userId", async (req, res) => {
    const [merchant] = await db.query.merchants.findMany({
      where: eq(merchants.userId, parseInt(req.params.userId)),
    });
    res.json(merchant);
  });

  app.get("/api/merchants/:id/contracts", async (req, res) => {
    const contracts = await db.query.contracts.findMany({
      where: eq(contracts.merchantId, parseInt(req.params.id)),
    });
    res.json(contracts);
  });

  // Admin routes
  app.get("/api/merchants", async (req, res) => {
    const merchants = await db.query.merchants.findMany();
    res.json(merchants);
  });

  app.get("/api/contracts", async (req, res) => {
    const contracts = await db.query.contracts.findMany();
    res.json(contracts);
  });

  const httpServer = createServer(app);
  return httpServer;
}
