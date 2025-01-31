import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users, verificationSessions, webhookEvents } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { testSendGridConnection, sendVerificationEmail, generateVerificationToken } from "./services/email";
import { Request, Response, NextFunction } from 'express';
import express from 'express';
import { diditService } from "./services/didit";
import axios from 'axios';

// Add Didit webhook types
export type VerificationStatus = 'initialized' | 'retrieved' | 'confirmed' | 'declined' | 'Approved' | 'Declined';

interface DiditWebhookPayload {
  session_id: string;
  status: VerificationStatus;
  created_at: number;
  timestamp: number;
  userId: string;
  data?: {
    verificationStatus: string;
    documentData?: any;
  };
  error?: {
    code: string;
    message: string;
  };
  vendor_data?: string;
  decision?: {
    kyc?: {
      document_data?: any;
    };
  };
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  const apiRouter = express.Router();

  // Customer routes
  apiRouter.get("/customers/:id/contracts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerContracts = await db
        .select({
          id: contracts.id,
          merchantId: contracts.merchantId,
          customerId: contracts.customerId,
          amount: contracts.amount,
          term: contracts.term,
          interestRate: contracts.interestRate,
          status: contracts.status,
          creditScore: contracts.creditScore,
          signedDocumentUrl: contracts.signedDocumentUrl,
          createdAt: contracts.createdAt
        })
        .from(contracts)
        .where(eq(contracts.customerId, parseInt(req.params.id)));

      res.json(customerContracts);
    } catch (err: any) {
      console.error("Error fetching customer contracts:", err);
      next(err);
    }
  });

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

  // Updated KYC routes
  apiRouter.post("/kyc/start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'Missing user ID' });
      }

      console.log('Starting KYC process for user:', userId);

      const sessionUrl = await diditService.initializeKycSession(userId);
      console.log('Generated KYC session URL:', sessionUrl);

      res.json({ redirectUrl: sessionUrl });
    } catch (err: any) {
      console.error('Error starting KYC process:', err);
      res.status(500).json({ 
        error: 'Failed to start verification process', 
        details: err.message 
      });
    }
  });

  apiRouter.get("/kyc/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.query.userId;

      // Better validation for user ID
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const parsedUserId = parseInt(userId as string);
      if (isNaN(parsedUserId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      // Fetch both verification session and status
      const [latestSession] = await db
        .select()
        .from(verificationSessions)
        .where(eq(verificationSessions.userId, parsedUserId))
        .orderBy(desc(verificationSessions.createdAt))
        .limit(1);

      let status;
      if (latestSession) {
        // Get real-time status from Didit API
        status = await diditService.getSessionStatus(latestSession.sessionId);
      } else {
        // Check user's stored KYC status if no active session
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, parsedUserId))
          .limit(1);

        status = user?.kycStatus || 'not_started';
      }

      res.json({ 
        status,
        sessionId: latestSession?.sessionId,
        lastUpdated: latestSession?.updatedAt || null
      });
    } catch (err) {
      console.error('Error checking KYC status:', err);
      next(err);
    }
  });

  // Updated webhook endpoint with better error handling and logging
  apiRouter.post("/kyc/webhook", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = req.body;
      console.log('Received Didit webhook:', payload);

      // Get required headers
      const signature = req.headers['x-signature'];
      const timestamp = req.headers['x-timestamp'];

      if (!signature || !timestamp) {
        return res.status(401).json({ error: 'Missing required headers' });
      }

      // Verify webhook signature
      if (!diditService.verifyWebhookSignature(
        JSON.stringify(payload),
        signature as string,
        timestamp as string
      )) {
        return res.status(401).json({ error: 'Invalid webhook signature or timestamp' });
      }

      // Process webhook asynchronously
      await diditService.processWebhook(payload);

      res.json({ status: 'success' });
    } catch (err) {
      console.error('Error processing Didit webhook:', err);
      // Still return 200 to acknowledge receipt
      res.status(200).json({ status: 'queued_for_retry' });
    }
  });

  // Add endpoint to retry failed webhooks manually
  apiRouter.post("/kyc/retry-webhooks", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await diditService.retryFailedWebhooks();
      res.json({ status: 'success' });
    } catch (err) {
      next(err);
    }
  });

  // Add callback URL endpoint for mobile app redirect
  apiRouter.get("/kyc/callback", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session_id: sessionId } = req.query;

      if (!sessionId) {
        return res.status(400).json({ error: 'Missing session ID' });
      }

      // Get the session status using the new method
      const status = await diditService.getSessionStatus(sessionId as string);

      // Redirect to appropriate page based on status
      let redirectUrl = '/dashboard';
      if (status === 'Approved') {
        redirectUrl = '/loan-offers?verified=true';
      } else if (status === 'Declined') {
        redirectUrl = '/dashboard?kyc=failed';
      }

      res.redirect(redirectUrl);
    } catch (err) {
      console.error('Error handling KYC callback:', err);
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