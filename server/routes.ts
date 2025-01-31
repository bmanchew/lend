import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users } from "@db/schema";
import { eq } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { testSendGridConnection, sendVerificationEmail } from "./services/email";
import { Request, Response, NextFunction } from 'express'; // Added for type safety

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Test SendGrid connection with improved error handling
  app.get("/api/test-email", async (req:Request, res:Response) => {
    try {
      const isConnected = await testSendGridConnection();
      if (isConnected) {
        res.json({ status: "success", message: "SendGrid connection successful" });
      } else {
        res.status(500).json({ status: "error", message: "SendGrid connection failed.  See logs for details." });
      }
    } catch (err:any) {
      console.error('SendGrid test error:', err);
      res.status(500).json({ status: "error", message: `SendGrid test failed: ${err.message}` });
    }
  });

  //New route to verify SendGrid setup
  app.get("/api/verify-sendgrid", async (req:Request, res:Response) => {
    try {
      const apiKey = process.env.SENDGRID_API_KEY;
      if (!apiKey || !apiKey.startsWith('SG.')) {
        return res.status(500).json({ status: "error", message: "Invalid or missing SendGrid API key." });
      }
      const isConnected = await testSendGridConnection();
      if (isConnected) {
        res.json({ status: "success", message: "SendGrid setup verified successfully." });
      } else {
        res.status(500).json({ status: "error", message: "SendGrid setup verification failed. Check API key and connection." });
      }
    } catch (err:any) {
      console.error('SendGrid verification error:', err);
      res.status(500).json({ status: "error", message: `SendGrid verification failed: ${err.message}` });
    }
  });

  // Customer routes
  app.get("/api/customers/:id/contracts", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const customerContracts = await db.query.contracts.findMany({
        where: eq(contracts.customerId, parseInt(req.params.id)),
        with: {
          merchant: true,
        },
      });
      res.json(customerContracts);
    } catch (err:any) {
      console.error("Error fetching customer contracts:", err); //Added logging
      next(err);
    }
  });

  // Merchant routes
  app.get("/api/merchants/by-user/:userId", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const [merchant] = await db.query.merchants.findMany({
        where: eq(merchants.userId, parseInt(req.params.userId)),
      });
      res.json(merchant);
    } catch (err:any) {
      console.error("Error fetching merchant by user:", err); //Added logging
      next(err);
    }
  });

  app.get("/api/merchants/:id/contracts", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const merchantContracts = await db.query.contracts.findMany({
        where: eq(contracts.merchantId, parseInt(req.params.id)),
        with: {
          customer: true,
        },
      });
      res.json(merchantContracts);
    } catch (err:any) {
      console.error("Error fetching merchant contracts:", err); //Added logging
      next(err);
    }
  });

  // Admin routes
  app.get("/api/merchants", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const allMerchants = await db.query.merchants.findMany({
        with: {
          user: true,
        },
      });
      res.json(allMerchants);
    } catch (err:any) {
      console.error("Error fetching all merchants:", err); //Added logging
      next(err);
    }
  });

  app.get("/api/contracts", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const allContracts = await db.query.contracts.findMany({
        with: {
          merchant: true,
          customer: true,
        },
      });
      res.json(allContracts);
    } catch (err:any) {
      console.error("Error fetching all contracts:", err); //Added logging
      next(err);
    }
  });

  // Global error handler
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    console.error("Global error handler caught:", err); //Added logging
    res.status(500).json({ error: "Internal server error" });
  });

  const httpServer = createServer(app);
  return httpServer;
}