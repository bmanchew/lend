import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users } from "@db/schema";
import { eq } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { testSendGridConnection, sendVerificationEmail, generateVerificationToken } from "./services/email";
import { Request, Response, NextFunction } from 'express';
import express from 'express';

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // API routes
  const apiRouter = express.Router();

  // Test SendGrid connection with improved error handling
  apiRouter.post("/test-verification-email", async (req: Request, res: Response) => {
    try {
      console.log('Received test email request:', req.body);
      const testEmail = req.body.email;

      if (!testEmail) {
        return res.status(400).json({ 
          status: "error", 
          message: "Email address is required" 
        });
      }

      if (!process.env.SENDGRID_API_KEY) {
        return res.status(500).json({
          status: "error",
          message: "SendGrid API key is not configured"
        });
      }

      console.log('Generating verification token for:', testEmail);
      const token = await generateVerificationToken();

      console.log('Attempting to send verification email to:', testEmail);
      const sent = await sendVerificationEmail(testEmail, token);

      if (sent) {
        console.log('Email sent successfully to:', testEmail);
        return res.json({ 
          status: "success", 
          message: "Verification email sent successfully" 
        });
      } else {
        console.error('Failed to send email to:', testEmail);
        return res.status(500).json({ 
          status: "error", 
          message: "Failed to send verification email" 
        });
      }
    } catch (err: any) {
      console.error('Test verification email error:', err);
      return res.status(500).json({ 
        status: "error", 
        message: err.message || "Failed to send test email" 
      });
    }
  });

  //New route to verify SendGrid setup
  apiRouter.get("/verify-sendgrid", async (req:Request, res:Response) => {
    try {
      const apiKey = process.env.SENDGRID_API_KEY;
      if (!apiKey || !apiKey.startsWith('SG.')) {
        return res.status(500).json({ 
          status: "error", 
          message: "Invalid or missing SendGrid API key." 
        });
      }
      const isConnected = await testSendGridConnection();
      if (isConnected) {
        res.json({ 
          status: "success", 
          message: "SendGrid setup verified successfully." 
        });
      } else {
        res.status(500).json({ 
          status: "error", 
          message: "SendGrid setup verification failed. Check API key and connection." 
        });
      }
    } catch (err:any) {
      console.error('SendGrid verification error:', err);
      res.status(500).json({ 
        status: "error", 
        message: err.message || "SendGrid verification failed" 
      });
    }
  });

  // Test SendGrid connection with improved error handling
  apiRouter.get("/test-email", async (req:Request, res:Response) => {
    try {
      const isConnected = await testSendGridConnection();
      if (isConnected) {
        res.json({ 
          status: "success", 
          message: "SendGrid connection successful" 
        });
      } else {
        res.status(500).json({ 
          status: "error", 
          message: "SendGrid connection failed. See logs for details." 
        });
      }
    } catch (err:any) {
      console.error('SendGrid test error:', err);
      res.status(500).json({ 
        status: "error", 
        message: err.message || "SendGrid test failed" 
      });
    }
  });

  // Customer routes
  apiRouter.get("/customers/:id/contracts", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const customerContracts = await db.query.contracts.findMany({
        where: eq(contracts.customerId, parseInt(req.params.id)),
        with: {
          merchant: true,
        },
      });
      res.json(customerContracts);
    } catch (err:any) {
      console.error("Error fetching customer contracts:", err); 
      next(err);
    }
  });

  // Merchant routes
  apiRouter.get("/merchants/by-user/:userId", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const [merchant] = await db.query.merchants.findMany({
        where: eq(merchants.userId, parseInt(req.params.userId)),
      });
      res.json(merchant);
    } catch (err:any) {
      console.error("Error fetching merchant by user:", err); 
      next(err);
    }
  });

  apiRouter.get("/merchants/:id/contracts", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const merchantContracts = await db.query.contracts.findMany({
        where: eq(contracts.merchantId, parseInt(req.params.id)),
        with: {
          customer: true,
        },
      });
      res.json(merchantContracts);
    } catch (err:any) {
      console.error("Error fetching merchant contracts:", err); 
      next(err);
    }
  });

  // Admin routes
  apiRouter.get("/merchants", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const allMerchants = await db.query.merchants.findMany({
        with: {
          user: true,
        },
      });
      res.json(allMerchants);
    } catch (err:any) {
      console.error("Error fetching all merchants:", err); 
      next(err);
    }
  });

  apiRouter.get("/contracts", async (req:Request, res:Response, next:NextFunction) => {
    try {
      const allContracts = await db.query.contracts.findMany({
        with: {
          merchant: true,
          customer: true,
        },
      });
      res.json(allContracts);
    } catch (err:any) {
      console.error("Error fetching all contracts:", err); 
      next(err);
    }
  });

  // Global error handler.  This remains outside the apiRouter.
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    console.error("Global error handler caught:", err); 
    if (!res.headersSent) {
      res.status(500).json({ 
        status: "error",
        message: err.message || "Internal server error" 
      });
    }
  });

  // Mount API router under /api prefix
  app.use('/api', apiRouter);

  const httpServer = createServer(app);
  return httpServer;
}