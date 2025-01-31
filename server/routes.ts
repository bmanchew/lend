import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { contracts, merchants, users } from "@db/schema";
import { eq } from "drizzle-orm";
import { setupAuth } from "./auth.js";
import { testSendGridConnection, sendVerificationEmail, generateVerificationToken } from "./services/email";
import { Request, Response, NextFunction } from 'express';
import express from 'express';
import { diditService } from "./services/didit";

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
      const customerContracts = await db
        .select()
        .from(contracts)
        .where(eq(contracts.customerId, parseInt(req.params.id)));

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

  // Add KYC routes here
  apiRouter.post("/kyc/start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.body;
      console.log('Starting KYC process for user:', userId);

      if (!userId) {
        return res.status(400).json({ error: 'Missing user ID' });
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

      const status = await diditService.checkVerificationStatus(parseInt(userId as string));
      res.json({ status });
    } catch (err) {
      next(err);
    }
  });


  // Add KYC Webhook endpoints
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

      // Verify webhook signature using the configured secret
      if (!diditService.verifyWebhookSignature(
        JSON.stringify(payload),
        signature as string,
        timestamp as string
      )) {
        return res.status(401).json({ error: 'Invalid webhook signature or timestamp' });
      }

      const { session_id, status, vendor_data, decision } = payload;

      // Log detailed information about the webhook
      console.log('Processing webhook:', {
        sessionId: session_id,
        status,
        vendorData: vendor_data,
        hasDecision: !!decision
      });

      // Handle different webhook statuses
      switch (status) {
        case 'retrieved':
          // Update session status when user opens verification in mobile app
          console.log('User retrieved verification session:', session_id);
          break;

        case 'Approved':
        case 'Declined':
          if (decision) {
            const userId = parseInt(vendor_data);
            await diditService.updateUserKycStatus(
              userId,
              status === 'Approved' ? 'verified' : 'failed'
            );

            if (decision.kyc?.document_data) {
              console.log('Received verified document data for user:', userId);
            }
          }
          break;

        default:
          console.log('Unhandled webhook status:', status);
      }

      res.json({ status: 'success' });
    } catch (err) {
      console.error('Error processing Didit webhook:', err);
      next(err);
    }
  });

  // Add KYC callback URL endpoint for mobile app redirect
  apiRouter.get("/kyc/callback", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session_id, status } = req.query;

      if (!session_id) {
        return res.status(400).json({ error: 'Missing session ID' });
      }

      // Get verification status from Didit API
      const verificationStatus = status?.toString().toLowerCase();

      // Redirect to appropriate page based on status
      const baseUrl = process.env.APP_URL || 'http://localhost:5000';
      let redirectPath = '/dashboard';
      let statusParam = '';

      switch (verificationStatus) {
        case 'approved':
        case 'success':
          statusParam = 'success';
          break;
        case 'declined':
        case 'failed':
          statusParam = 'failed';
          break;
        case 'pending':
        case 'in_review':
          statusParam = 'pending';
          break;
        default:
          statusParam = 'unknown';
      }

      // Add status parameter and session ID to URL
      redirectPath += `?kyc=${statusParam}&session=${session_id}`;

      // Redirect to frontend application
      res.redirect(`${baseUrl}${redirectPath}`);
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