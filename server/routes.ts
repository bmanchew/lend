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
interface DiditWebhookPayload {
  sessionId: string;
  status: 'initialized' | 'retrieved' | 'confirmed' | 'declined' | 'Approved' | 'Declined';
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
  apiRouter.get("/verify-sendgrid", async (req: Request, res: Response) => {
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
    } catch (err: any) {
      console.error('SendGrid verification error:', err);
      res.status(500).json({
        status: "error",
        message: err.message || "SendGrid verification failed"
      });
    }
  });

  // Test SendGrid connection with improved error handling
  apiRouter.get("/test-email", async (req: Request, res: Response) => {
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
    } catch (err: any) {
      console.error('SendGrid test error:', err);
      res.status(500).json({
        status: "error",
        message: err.message || "SendGrid test failed"
      });
    }
  });


  // Merchant routes
  apiRouter.get("/merchants/by-user/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [merchant] = await db.query.merchants.findMany({
        where: eq(merchants.userId, parseInt(req.params.userId)),
      });
      res.json(merchant);
    } catch (err: any) {
      console.error("Error fetching merchant by user:", err);
      next(err);
    }
  });

  apiRouter.get("/merchants/:id/contracts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const merchantContracts = await db.query.contracts.findMany({
        where: eq(contracts.merchantId, parseInt(req.params.id)),
        with: {
          customer: true,
        },
      });
      res.json(merchantContracts);
    } catch (err: any) {
      console.error("Error fetching merchant contracts:", err);
      next(err);
    }
  });

  // Admin routes
  apiRouter.get("/merchants", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allMerchants = await db.query.merchants.findMany({
        with: {
          user: true,
        },
      });
      res.json(allMerchants);
    } catch (err: any) {
      console.error("Error fetching all merchants:", err);
      next(err);
    }
  });

  apiRouter.get("/contracts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allContracts = await db.query.contracts.findMany({
        with: {
          merchant: true,
          customer: true,
        },
      });
      res.json(allContracts);
    } catch (err: any) {
      console.error("Error fetching all contracts:", err);
      next(err);
    }
  });

  // Updated KYC routes
  apiRouter.post("/kyc/start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.body;
      console.log('Starting KYC process for user:', userId);

      if (!userId) {
        return res.status(400).json({ error: 'Missing user ID' });
      }

      // Check for any existing active sessions
      const [activeSession] = await db
        .select()
        .from(verificationSessions)
        .where(
          and(
            eq(verificationSessions.userId, userId),
            eq(verificationSessions.status, 'initialized')
          )
        )
        .limit(1);

      if (activeSession) {
        // Get a fresh session URL from Didit service
        const sessionUrl = await diditService.getSessionStatus(activeSession.sessionId);
        return res.json({ redirectUrl: sessionUrl });
      }

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
      if (!userId || isNaN(parseInt(userId as string))) {
        return res.status(400).json({ error: 'Invalid user ID' });
      }

      // Get latest verification session
      const [latestSession] = await db
        .select()
        .from(verificationSessions)
        .where(eq(verificationSessions.userId, parseInt(userId as string)))
        .orderBy(desc(verificationSessions.createdAt))
        .limit(1);

      if (!latestSession) {
        return res.json({ status: 'not_started' });
      }

      res.json({
        status: latestSession.status,
        updatedAt: latestSession.updatedAt,
        sessionId: latestSession.sessionId
      });
    } catch (err) {
      next(err);
    }
  });

  // Add endpoint to update verification status manually
  apiRouter.patch("/kyc/verification-status/:sessionId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const { new_status, comment } = req.body;

      if (!sessionId || !new_status) {
        return res.status(400).json({ error: 'Session ID and new status are required' });
      }

      if (!['Approved', 'Declined'].includes(new_status)) {
        return res.status(400).json({ error: 'Invalid status. Must be either Approved or Declined' });
      }

      await diditService.updateSessionStatus(sessionId, new_status as 'Approved' | 'Declined', comment);

      res.json({ status: 'success', message: 'Verification status updated successfully' });
    } catch (err: any) {
      console.error('Error updating verification status:', err);
      next(err);
    }
  });

  // Update the webhook endpoint to include more logging
  apiRouter.post("/kyc/webhook", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = req.body;
      console.log('Received Didit webhook payload:', {
        session_id: payload.session_id,
        status: payload.status,
        hasDecision: !!payload.decision
      });

      // Get required headers
      const signature = req.headers['x-signature'];
      const timestamp = req.headers['x-timestamp'];

      if (!signature || !timestamp) {
        console.error('Missing webhook headers:', { signature: !!signature, timestamp: !!timestamp });
        return res.status(401).json({ error: 'Missing required headers' });
      }

      // Verify webhook signature
      if (!diditService.verifyWebhookSignature(
        JSON.stringify(payload),
        signature as string,
        timestamp as string
      )) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid webhook signature or timestamp' });
      }

      console.log('Processing verified webhook with status:', payload.status);

      // Process webhook asynchronously
      await diditService.processWebhook(payload);
      console.log('Successfully processed webhook for session:', payload.session_id);

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